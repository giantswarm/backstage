import {
  AuthService,
  BackstageCredentials,
  BackstageUserPrincipal,
  DiscoveryService,
  RootConfigService,
} from '@backstage/backend-plugin-api';

/**
 * Header the frontend forwards the user's main Dex ID token in, the subject
 * token the cluster-token route exchanges for each installation's token. The
 * name is the auth module's (`SUBJECT_TOKEN_HEADER` there).
 */
export const SUBJECT_TOKEN_HEADER = 'gs-subject-token';

/**
 * Bounds one management cluster's answer, so an unreachable one cannot hold
 * the page: the slowest healthy installation answers in under two seconds.
 */
const REQUEST_TIMEOUT_MS = 5000;

/** How long a person's answer for one installation is served without asking it again. */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** A failed answer is asked again sooner, but not on every page view. */
const FAILURE_TTL_MS = 30 * 1000;

/** Where a management cluster's own `Cluster` resource lives. */
const MANAGEMENT_CLUSTER_NAMESPACE = 'org-giantswarm';
const CAPI_GROUP = 'cluster.x-k8s.io';
const RELEASE_LABEL = 'release.giantswarm.io/version';

/** One version cell of the Installations page, as the frontend renders it. */
export type VersionCell =
  | { state: 'known'; version: string }
  | { state: 'absent'; reason: string }
  | { state: 'failed'; reason: string };

export type ManagementClusterVersions = {
  kubernetes: VersionCell;
  release: VersionCell;
};

const NO_RELEASE: VersionCell = {
  state: 'absent',
  reason: 'The management cluster carries no Giant Swarm release',
};
const NOT_SIGNED_IN = 'Not signed in to the installation';

type Installation = {
  name: string;
  authProvider: string;
  oidcTokenProvider?: string;
};

/** A request that failed, with the short reason the cell shows. */
class RequestFailed extends Error {}

/** The short reason for a failed management cluster response. */
function reasonForStatus(status: number): string {
  switch (status) {
    case 401:
      return NOT_SIGNED_IN;
    case 403:
      return 'Access forbidden';
    case 404:
      return 'API not found';
    default:
      return `API request failed (HTTP ${status})`;
  }
}

function failed(error: unknown): VersionCell {
  return {
    state: 'failed',
    reason:
      error instanceof RequestFailed ? error.message : 'API request failed',
  };
}

/**
 * Every management cluster's Kubernetes version and Giant Swarm release for
 * one person, read as that person: their main Dex session is exchanged for
 * each installation's token at the cluster-token route, and each cluster is
 * read through the Kubernetes plugin's proxy, all installations at once.
 * Each installation's answer is kept for a few minutes per person, a failed
 * one for half a minute.
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
    },
  ) {}

  async read(
    credentials: BackstageCredentials<BackstageUserPrincipal>,
    subjectToken: string,
  ): Promise<Record<string, ManagementClusterVersions>> {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }

    const user = credentials.principal.userEntityRef;
    const entries = await Promise.all(
      this.installations().map(async installation => {
        const key = `${user}:${installation.name}`;
        let entry = this.cache.get(key);
        if (!entry) {
          const versions = this.readInstallation(
            installation,
            credentials,
            subjectToken,
          );
          entry = { expiresAt: now + CACHE_TTL_MS, versions };
          this.cache.set(key, entry);
          const cached = entry;
          versions.then(result => {
            if (
              result.kubernetes.state === 'failed' ||
              result.release.state === 'failed'
            ) {
              cached.expiresAt = Date.now() + FAILURE_TTL_MS;
            }
          });
        }
        return [installation.name, await entry.versions] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  /** The installations the portal is connected to, from `gs.installations`. */
  private installations(): Installation[] {
    const installations =
      this.options.config.getOptionalConfig('gs.installations');
    return (installations?.keys() ?? []).flatMap(name => {
      const installation = installations!.getConfig(name);
      const authProvider = installation.getOptionalString('authProvider');
      return authProvider
        ? [
            {
              name,
              authProvider,
              oidcTokenProvider:
                installation.getOptionalString('oidcTokenProvider'),
            },
          ]
        : [];
    });
  }

  private async readInstallation(
    installation: Installation,
    credentials: BackstageCredentials<BackstageUserPrincipal>,
    subjectToken: string,
  ): Promise<ManagementClusterVersions> {
    let get: (path: string) => Promise<Response>;
    try {
      get = await this.clusterClient(installation, credentials, subjectToken);
    } catch (error) {
      const cell = failed(error);
      return { kubernetes: cell, release: cell };
    }

    const [kubernetes, release] = await Promise.all([
      this.kubernetesVersion(get),
      this.releaseVersion(installation.name, get),
    ]);
    // An installation that cannot be reached says so once, in both cells.
    return {
      kubernetes,
      release: kubernetes.state === 'failed' ? kubernetes : release,
    };
  }

  private async kubernetesVersion(
    get: (path: string) => Promise<Response>,
  ): Promise<VersionCell> {
    try {
      const response = await get('/version');
      if (!response.ok) {
        throw new RequestFailed(reasonForStatus(response.status));
      }
      const { gitVersion } = (await response.json()) as { gitVersion: string };
      return { state: 'known', version: gitVersion };
    } catch (error) {
      return failed(error);
    }
  }

  /**
   * The release label of the management cluster's own `Cluster`, read at the
   * CAPI group's preferred version. No CAPI on the installation, no such
   * `Cluster` or no label means no release, not a failure.
   */
  private async releaseVersion(
    name: string,
    get: (path: string) => Promise<Response>,
  ): Promise<VersionCell> {
    try {
      const group = await get(`/apis/${CAPI_GROUP}`);
      if (group.status === 404) {
        return NO_RELEASE;
      }
      if (!group.ok) {
        throw new RequestFailed(reasonForStatus(group.status));
      }
      const { preferredVersion } = (await group.json()) as {
        preferredVersion: { groupVersion: string };
      };

      const cluster = await get(
        `/apis/${preferredVersion.groupVersion}/namespaces/${MANAGEMENT_CLUSTER_NAMESPACE}/clusters/${encodeURIComponent(name)}`,
      );
      if (cluster.status === 404) {
        return NO_RELEASE;
      }
      if (!cluster.ok) {
        throw new RequestFailed(reasonForStatus(cluster.status));
      }
      const { metadata } = (await cluster.json()) as {
        metadata?: { labels?: Record<string, string> };
      };
      const version = metadata?.labels?.[RELEASE_LABEL];
      return version ? { state: 'known', version } : NO_RELEASE;
    } catch (error) {
      return failed(error);
    }
  }

  /**
   * A GET against the installation's API server through the Kubernetes
   * plugin's proxy, as the person: the main session itself for the main
   * installation, an exchanged cluster token for every other OIDC one.
   */
  private async clusterClient(
    installation: Installation,
    credentials: BackstageCredentials<BackstageUserPrincipal>,
    subjectToken: string,
  ): Promise<(path: string) => Promise<Response>> {
    const { auth, discovery } = this.options;
    const { authProvider, oidcTokenProvider } = installation;

    const authHeaders: Record<string, string> = {};
    if (authProvider === 'oidc') {
      const header = [
        'Backstage-Kubernetes-Authorization',
        authProvider,
        oidcTokenProvider,
      ]
        .filter(Boolean)
        .join('-');
      authHeaders[header] = await this.clusterToken(
        installation,
        credentials,
        subjectToken,
      );
    }

    const [baseUrl, { token }] = await Promise.all([
      discovery.getBaseUrl('kubernetes'),
      auth.getPluginRequestToken({
        onBehalfOf: credentials,
        targetPluginId: 'kubernetes',
      }),
    ]);

    return async path => {
      try {
        return await fetch(`${baseUrl}/proxy${path}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Backstage-Kubernetes-Cluster': installation.name,
            ...authHeaders,
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        throw new RequestFailed(
          (error as Error).name === 'TimeoutError'
            ? 'API unreachable (timeout)'
            : 'API unreachable',
        );
      }
    };
  }

  private async clusterToken(
    installation: Installation,
    credentials: BackstageCredentials<BackstageUserPrincipal>,
    subjectToken: string,
  ): Promise<string> {
    const mainProvider =
      this.options.config.getOptionalString('gs.authProvider');
    if (installation.oidcTokenProvider === mainProvider) {
      return subjectToken;
    }

    const { auth, discovery } = this.options;
    const [baseUrl, { token }] = await Promise.all([
      discovery.getBaseUrl('auth'),
      auth.getPluginRequestToken({
        onBehalfOf: credentials,
        targetPluginId: 'auth',
      }),
    ]);
    let response: Response;
    try {
      response = await fetch(
        `${baseUrl}/cluster-token/${encodeURIComponent(installation.name)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            [SUBJECT_TOKEN_HEADER]: subjectToken,
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
    } catch {
      throw new RequestFailed('Cluster token broker unreachable');
    }
    if (response.status === 401 || response.status === 403) {
      throw new RequestFailed(NOT_SIGNED_IN);
    }
    if (!response.ok) {
      throw new RequestFailed('Cluster token exchange failed');
    }
    const body = (await response.json()) as { token?: string };
    if (!body.token) {
      throw new RequestFailed('Cluster token exchange failed');
    }
    return body.token;
  }
}
