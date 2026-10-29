import {
  AuthService,
  BackstageCredentials,
  BackstageUserPrincipal,
  DiscoveryService,
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import {
  Labels,
  ManagementClusterVersionCell,
  ManagementClusterVersions,
  ManagementClusterVersionsResponse,
  SUBJECT_TOKEN_HEADER,
} from '@giantswarm/backstage-plugin-gs-common';

/**
 * Bounds one installation's whole answer (token exchange, `/version`, the
 * release lookup), so an unreachable one cannot hold the page. The muster
 * broker issues a person's cold exchanges for a full fleet one after another,
 * about six seconds for the last of 28; a reachable cluster answers in under
 * two seconds after that.
 */
const INSTALLATION_DEADLINE_MS = 15_000;

/** How long a person's answer for one installation is served without asking it again. */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** A failed answer is asked again sooner, but not on every page view. */
const FAILURE_TTL_MS = 30 * 1000;

/** Where a management cluster's own `Cluster` resource lives. */
const MANAGEMENT_CLUSTER_NAMESPACE = 'org-giantswarm';
const CAPI_GROUP = 'cluster.x-k8s.io';

/**
 * The Kubernetes plugin's auth providers it authenticates on the server, with
 * no token from the browser.
 */
const SERVER_SIDE_AUTH_PROVIDERS = new Set([
  'aws',
  'azure',
  'googleServiceAccount',
  'localKubectlProxy',
  'serviceAccount',
]);

const NO_RELEASE: ManagementClusterVersionCell = {
  state: 'absent',
  reason: 'The management cluster carries no Giant Swarm release',
};

const NOT_SIGNED_IN: ManagementClusterVersionCell = {
  state: 'failed',
  reason: 'Not signed in',
  detail: 'Not signed in to the installation: sign in to the portal again',
};
const TIMED_OUT: ManagementClusterVersionCell = {
  state: 'failed',
  reason: 'Timed out',
  detail: `The installation did not answer within ${
    INSTALLATION_DEADLINE_MS / 1000
  } seconds`,
};
const UNREACHABLE: ManagementClusterVersionCell = {
  state: 'failed',
  reason: 'Unreachable',
  detail: "The installation's API server could not be reached",
};
const BROKER_UNAVAILABLE: ManagementClusterVersionCell = {
  state: 'failed',
  reason: 'Token broker unavailable',
  detail: 'The cluster token broker could not be reached; try again shortly',
};
const EXCHANGE_FAILED: ManagementClusterVersionCell = {
  state: 'failed',
  reason: 'Token exchange failed',
  detail: "The cluster token broker did not issue the installation's token",
};
const READ_FAILED: ManagementClusterVersionCell = {
  state: 'failed',
  reason: 'Read failed',
  detail: "The installation's versions could not be read",
};

/** The cell for a failed management cluster response. */
function failedStatus(status: number): ManagementClusterVersionCell {
  switch (status) {
    case 401:
      return NOT_SIGNED_IN;
    case 403:
      return {
        state: 'failed',
        reason: 'Access forbidden',
        detail: 'You may not read this from the management cluster',
      };
    case 404:
      return {
        state: 'failed',
        reason: 'API not found',
        detail: "The portal does not know the installation's API server",
      };
    default:
      return {
        state: 'failed',
        reason: `HTTP ${status}`,
        detail: `The management cluster answered HTTP ${status}`,
      };
  }
}

/** A read that failed, with the cell it shows. */
class ReadFailed extends Error {
  constructor(readonly cell: ManagementClusterVersionCell) {
    super(cell.state === 'failed' ? cell.reason : 'read failed');
  }
}

/** The cell for anything a read threw: a timeout, a refused connection, a bad body. */
function failedCell(error: unknown, signal: AbortSignal) {
  if (error instanceof ReadFailed) {
    return error.cell;
  }
  const name = (error as Error | undefined)?.name;
  if (signal.aborted || name === 'TimeoutError' || name === 'AbortError') {
    return TIMED_OUT;
  }
  // What fetch rejects with when it cannot connect at all.
  return error instanceof TypeError ? UNREACHABLE : READ_FAILED;
}

function bothCells(
  cell: ManagementClusterVersionCell,
): ManagementClusterVersions {
  return { kubernetes: cell, release: cell };
}

type Installation = {
  name: string;
  /**
   * How the backend authenticates to the cluster as the person: the main
   * session itself, a token from the cluster-token route, or nothing (the
   * Kubernetes plugin authenticates on the server).
   */
  token: 'main' | 'exchanged' | 'none';
  /** `Backstage-Kubernetes-Authorization-*` header the token goes in. */
  authHeader?: string;
};

/** What every installation's read uses alike: resolved once per read. */
type Clients = {
  kubernetesUrl: string;
  kubernetesToken: string;
  authUrl: string;
  authToken: string;
};

/**
 * Every management cluster's Kubernetes version and Giant Swarm release for
 * one person, read as that person: the main installation with their main Dex
 * session, each one covered by the cluster token broker with the token the
 * cluster-token route exchanges it for, each one the Kubernetes plugin
 * authenticates to itself as is, all installations at once and through the
 * Kubernetes plugin's proxy. The others (their own OIDC sign-in, or a
 * `backendUrl` override) are left to the browser. Each installation's answer
 * is kept for a few minutes per person, a failed one for half a minute.
 */
export class ManagementClusterVersionsService {
  private readonly cache = new Map<
    string,
    { expiresAt: number; versions: Promise<ManagementClusterVersions> }
  >();

  constructor(
    private readonly options: {
      config: RootConfigService;
      auth: AuthService;
      discovery: DiscoveryService;
      logger: LoggerService;
    },
  ) {}

  async read(
    credentials: BackstageCredentials<BackstageUserPrincipal>,
    subjectToken: string,
  ): Promise<ManagementClusterVersionsResponse> {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }

    const { read, readInBrowser } = this.installations();
    const user = credentials.principal.userEntityRef;
    let clients: Promise<Clients> | undefined;
    const entries = await Promise.all(
      read.map(async installation => {
        const key = `${user}:${installation.name}`;
        let entry = this.cache.get(key);
        if (!entry) {
          clients ??= this.clients(credentials);
          const cached = {
            expiresAt: now + CACHE_TTL_MS,
            versions: this.readInstallation(installation, clients, subjectToken)
              .then(result => {
                if (
                  result.kubernetes.state === 'failed' ||
                  result.release.state === 'failed'
                ) {
                  cached.expiresAt = Date.now() + FAILURE_TTL_MS;
                }
                return result;
              })
              .catch(error => {
                // Never keep a rejection: the next read asks again.
                this.cache.delete(key);
                this.options.logger.error(
                  'Reading a management cluster version failed unexpectedly',
                  { installation: installation.name, error: String(error) },
                );
                return bothCells(READ_FAILED);
              }),
          };
          entry = cached;
          this.cache.set(key, entry);
        }
        return [installation.name, await entry.versions] as const;
      }),
    );
    return { installations: Object.fromEntries(entries), readInBrowser };
  }

  /**
   * The installations the portal is connected to (`gs.installations` with an
   * `authProvider`), split into the ones this backend reads as the person and
   * the ones only the browser can: the frontend's own rule
   * (`GSAuthProviders.isBrokerCovered`), and a `backendUrl` override, whose
   * cluster another backend serves.
   */
  private installations(): { read: Installation[]; readInBrowser: string[] } {
    const { config } = this.options;
    const mainProvider = config.getOptionalString('gs.authProvider');
    const broker = config.getOptionalConfig('gs.clusterTokenBroker');
    const musterBroker = Boolean(broker?.getOptionalString('tokenUrl'));
    const dexTargets = new Set(broker?.getOptionalConfig('targets')?.keys());

    const read: Installation[] = [];
    const readInBrowser: string[] = [];
    const installations = config.getOptionalConfig('gs.installations');
    for (const name of installations?.keys() ?? []) {
      const installation = installations!.getConfig(name);
      const authProvider = installation.getOptionalString('authProvider');
      if (!authProvider) {
        continue;
      }
      if (installation.getOptionalString('backendUrl')) {
        readInBrowser.push(name);
        continue;
      }
      if (SERVER_SIDE_AUTH_PROVIDERS.has(authProvider)) {
        read.push({ name, token: 'none' });
        continue;
      }
      if (authProvider !== 'oidc') {
        readInBrowser.push(name);
        continue;
      }

      const oidcTokenProvider =
        installation.getOptionalString('oidcTokenProvider');
      const authHeader = [
        'Backstage-Kubernetes-Authorization-oidc',
        oidcTokenProvider,
      ]
        .filter(Boolean)
        .join('-');
      if (mainProvider && oidcTokenProvider === mainProvider) {
        read.push({ name, token: 'main', authHeader });
      } else if (
        mainProvider &&
        (dexTargets.has(name) ||
          (musterBroker &&
            Boolean(installation.getOptionalString('clusterTokenAudience'))))
      ) {
        read.push({ name, token: 'exchanged', authHeader });
      } else {
        readInBrowser.push(name);
      }
    }
    return { read, readInBrowser };
  }

  /** The Kubernetes plugin's proxy and the auth plugin's route, as the person. */
  private async clients(
    credentials: BackstageCredentials<BackstageUserPrincipal>,
  ): Promise<Clients> {
    const { auth, discovery } = this.options;
    const [kubernetesUrl, kubernetes, authUrl, authPlugin] = await Promise.all([
      discovery.getBaseUrl('kubernetes'),
      auth.getPluginRequestToken({
        onBehalfOf: credentials,
        targetPluginId: 'kubernetes',
      }),
      discovery.getBaseUrl('auth'),
      auth.getPluginRequestToken({
        onBehalfOf: credentials,
        targetPluginId: 'auth',
      }),
    ]);
    return {
      kubernetesUrl,
      kubernetesToken: kubernetes.token,
      authUrl,
      authToken: authPlugin.token,
    };
  }

  private async readInstallation(
    installation: Installation,
    clientsPromise: Promise<Clients>,
    subjectToken: string,
  ): Promise<ManagementClusterVersions> {
    const signal = AbortSignal.timeout(INSTALLATION_DEADLINE_MS);
    // A plugin token or discovery failure is this backend's, not the
    // installation's: it rejects, and the read is not kept.
    const clients = await clientsPromise;
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${clients.kubernetesToken}`,
        'Backstage-Kubernetes-Cluster': installation.name,
      };
      if (installation.authHeader) {
        headers[installation.authHeader] =
          installation.token === 'main'
            ? subjectToken
            : await this.clusterToken(
                installation.name,
                clients,
                subjectToken,
                signal,
              );
      }
      const get = async <T>(path: string): Promise<T | undefined> => {
        const response = await fetch(`${clients.kubernetesUrl}/proxy${path}`, {
          headers,
          signal,
        });
        if (response.status === 404) {
          return undefined;
        }
        if (!response.ok) {
          throw new ReadFailed(failedStatus(response.status));
        }
        return (await response.json()) as T;
      };

      const version = await get<{ gitVersion: string }>('/version');
      if (!version) {
        throw new ReadFailed(failedStatus(404));
      }
      const kubernetes: ManagementClusterVersionCell = {
        state: 'known',
        version: version.gitVersion,
      };
      // Asked only once the API server answered: an unreachable installation
      // costs one request, not three.
      return {
        kubernetes,
        release: await this.release(installation.name, get),
      };
    } catch (error) {
      // An installation that cannot be reached says so once, in both cells.
      return bothCells(failedCell(error, signal));
    }
  }

  /**
   * The release label of the management cluster's own `Cluster`, read at the
   * CAPI group's preferred version. No CAPI on the installation, no such
   * `Cluster` or no label means no release, not a failure.
   */
  private async release(
    name: string,
    get: <T>(path: string) => Promise<T | undefined>,
  ): Promise<ManagementClusterVersionCell> {
    const group = await get<{ preferredVersion: { groupVersion: string } }>(
      `/apis/${CAPI_GROUP}`,
    );
    if (!group) {
      return NO_RELEASE;
    }
    const cluster = await get<{
      metadata?: { labels?: Record<string, string> };
    }>(
      `/apis/${group.preferredVersion.groupVersion}/namespaces/${MANAGEMENT_CLUSTER_NAMESPACE}/clusters/${encodeURIComponent(name)}`,
    );
    const version = cluster?.metadata?.labels?.[Labels.labelReleaseVersion];
    return version ? { state: 'known', version } : NO_RELEASE;
  }

  /**
   * The installation's token from the cluster-token route, which answers a
   * rejected subject token with 502 `subject_invalid` and a broker it could
   * not reach with 502 `broker_unreachable` / `broker_unavailable`.
   */
  private async clusterToken(
    name: string,
    clients: Clients,
    subjectToken: string,
    signal: AbortSignal,
  ): Promise<string> {
    let response: Response;
    try {
      response = await fetch(
        `${clients.authUrl}/cluster-token/${encodeURIComponent(name)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${clients.authToken}`,
            [SUBJECT_TOKEN_HEADER]: subjectToken,
          },
          signal,
        },
      );
    } catch (error) {
      throw signal.aborted ? error : new ReadFailed(BROKER_UNAVAILABLE);
    }
    const body = (await response.json().catch(() => ({}))) as {
      token?: string;
      reason?: string;
    };
    if (response.ok && body.token) {
      return body.token;
    }
    if (
      response.status === 401 ||
      response.status === 403 ||
      body.reason === 'subject_invalid'
    ) {
      throw new ReadFailed(NOT_SIGNED_IN);
    }
    if (
      body.reason === 'broker_unreachable' ||
      body.reason === 'broker_unavailable'
    ) {
      throw new ReadFailed(BROKER_UNAVAILABLE);
    }
    if (signal.aborted) {
      throw new ReadFailed(TIMED_OUT);
    }
    throw new ReadFailed(EXCHANGE_FAILED);
  }
}
