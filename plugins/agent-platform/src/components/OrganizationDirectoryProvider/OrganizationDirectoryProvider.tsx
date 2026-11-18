import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  QueryClientContext,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- Muster owns the shared installation query key.
import {
  isMusterAuthFailure,
  musterInstallationsQueryKey,
  musterServerListQueryKey,
  useMusterServerAvailability,
} from '@giantswarm/backstage-plugin-muster';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import { AgentManagerClient } from '../../apis/AgentManagerClient';
import {
  AGENT_MANAGER_SERVER,
  AgentManagerNotConnectedError,
} from '../../lib/agentManager';
import { useMusterPluginApi } from '../../hooks/useMusterPluginApi';
import { useTurnedOffInstallations } from '../../hooks/useTurnedOffInstallations';
import {
  musterAgentManagerInfoQueryKey,
  musterOrganizationsQueryKey,
} from '../../lib/queryKeys';
import {
  EMPTY_ORGANIZATION_DIRECTORY,
  ORGANIZATIONS_CAPABILITY,
  organizationNamespacesOf,
  type OrganizationDirectory,
  type OrganizationNamespace,
  type OrganizationListing,
} from '../../lib/organizations';

export type OrganizationDirectoryValue = {
  /** Which organization each namespace is, on every installation read. */
  directory: OrganizationDirectory;
  /**
   * The installations whose agent-manager serves the organization tools,
   * in the order the portal lists them.
   */
  installations: string[];
  /**
   * Why muster's installations could not be read, if they could not: then
   * no installation could be checked at all.
   */
  listingError: string | undefined;
  /**
   * The installations it could not be learned of whether they serve
   * organizations, in muster's order, each with why. An installation that
   * answered without organizations is not one of them.
   */
  uncheckedInstallations: UncheckedInstallation[];
  /**
   * muster lists installations, none is still being read, and not one of
   * them could be checked: nothing is known about organizations anywhere.
   */
  noneChecked: boolean;
  /**
   * Why it could not be learned whether `installation` serves
   * organizations, if it could not: muster's installations unread, the
   * installation not among them, or its agent-manager unreachable or
   * unasked. Another installation's failure is not this one's.
   */
  discoveryFailureOf: (installation: string) => string | undefined;
  /**
   * The person's sign-in to agent-manager on `installation` is missing, so
   * its organizations could not be read, if so: what the read was answered,
   * and whether muster asked for the sign-in (rather than answering "not
   * connected" some other way). A sign-in, then `recheck`, decides it.
   */
  signInOf: (installation: string) => AgentManagerSignIn | undefined;
  /** The person's organizations on one installation, once answered. */
  organizationsOf: (installation: string) => OrganizationListing | undefined;
  /** Why an installation's organizations could not be read, if they could not. */
  failureOf: (installation: string) => string | undefined;
  /**
   * Reads an installation's organizations again (Check again), and whether
   * it serves them (after a sign-in): its muster's server list too.
   */
  recheck: (installation: string) => Promise<void>;
  /** True while an installation's answer is still to come. */
  isLoading: boolean;
  /** True while `installation`'s answer is still to come. */
  isLoadingOf: (installation: string) => boolean;
};

/** A missing sign-in to agent-manager on one installation. */
export type AgentManagerSignIn = {
  message: string;
  signInRequired: boolean;
};

/**
 * Why an installation could not be checked for organizations:
 * - `musterSignIn`: muster refused the person's session there (no token, or
 *   one it did not take): a sign-in to Muster for the installation fixes it.
 * - `connectorSignIn`: muster answered, and its agent-manager connector
 *   wants the person's sign-in.
 * - `unreachable`: the portal knows it cannot reach the installation's
 *   muster; nothing the person does here changes that.
 * - `noAnswer`: its muster did not answer (503); it may later.
 * - `sharedIdentity`: the portal reaches its muster without a per-user
 *   sign-in, and organizations are read as the person.
 * - `failed`: any other failure; `message` quotes it.
 */
export type UncheckedReason =
  | 'musterSignIn'
  | 'connectorSignIn'
  | 'unreachable'
  | 'noAnswer'
  | 'sharedIdentity'
  | 'failed';

/** One installation that could not be checked for organizations. */
export type UncheckedInstallation = {
  installation: string;
  reason: UncheckedReason;
  /** Why, in a sentence that names the installation. */
  message: string;
};

/** The sentence that says why `installation` could not be checked. */
function uncheckedMessage(
  installation: string,
  reason: UncheckedReason,
  detail?: string,
): string {
  switch (reason) {
    case 'musterSignIn':
      return `You are not signed in to Muster for ${installation}, so the portal could not check whether it serves organizations. Sign in to Muster for ${installation} on the Connectors page, then check again.`;
    case 'unreachable':
      return `The portal cannot reach Muster on ${installation}, so it could not check whether ${installation} serves organizations.`;
    case 'noAnswer':
      return `Muster on ${installation} did not answer, so the portal could not check whether ${installation} serves organizations. Try again later.`;
    case 'sharedIdentity':
      return `The portal reaches Muster on ${installation} without a per-user sign-in. Organizations are read as you, so they cannot be read on ${installation}.`;
    default:
      return detail
        ? `Could not check whether ${installation} serves organizations: ${detail}`
        : `Could not check whether ${installation} serves organizations.`;
  }
}

/** Why the read of an installation's muster server list failed. */
function serverListFailureReason(
  error: Error | undefined,
  probedUnreachable: boolean,
): UncheckedReason {
  if (probedUnreachable) {
    return 'unreachable';
  }
  if (
    isMusterAuthFailure(error) ||
    (error as { name?: unknown } | undefined)?.name === 'MusterTokenMintError'
  ) {
    return 'musterSignIn';
  }
  if ((error as { status?: unknown } | undefined)?.status === 503) {
    return 'noAnswer';
  }
  return 'failed';
}

const EMPTY: OrganizationDirectoryValue = {
  directory: EMPTY_ORGANIZATION_DIRECTORY,
  installations: [],
  listingError: undefined,
  uncheckedInstallations: [],
  noneChecked: false,
  discoveryFailureOf: () => undefined,
  signInOf: () => undefined,
  organizationsOf: () => undefined,
  failureOf: () => undefined,
  recheck: async () => {},
  isLoading: false,
  isLoadingOf: () => false,
};

const OrganizationDirectoryContext =
  createContext<OrganizationDirectoryValue>(EMPTY);

/**
 * Reads, on every installation whose agent-manager reports the
 * `organizations` capability, the organizations the signed-in person manages
 * or belongs to (`list_organizations`, as the person). What every page below names
 * an agent's organization by: the namespace's labels, as agent-manager
 * answers them, never the namespace's name.
 *
 * Outside it, no namespace is an organization: a page names it as a
 * namespace.
 */
export function OrganizationDirectoryProvider({
  children,
}: {
  children: ReactNode;
}) {
  // One reader: a provider inside another (a router inside the plugin's
  // providers) passes the outer one's answer on.
  const outer = useContext(OrganizationDirectoryContext);
  // Without a query client (a page rendered outside the plugin's own, as
  // in a component's test) nothing is read and no namespace is an
  // organization.
  const queryClient = useContext(QueryClientContext);
  if (outer !== EMPTY || !queryClient) {
    return <>{children}</>;
  }
  return <ReadOrganizationDirectory>{children}</ReadOrganizationDirectory>;
}

function ReadOrganizationDirectory({ children }: { children: ReactNode }) {
  const musterApi = useMusterPluginApi();
  const queryClient = useQueryClient();
  // agent-manager is reached through muster only, so the installations are
  // muster's: the muster plugin's own read of `/installations`, under its
  // key, shared with the page header's installation selector.
  const musterInstallations = useQuery({
    queryKey: musterInstallationsQueryKey(),
    enabled: Boolean(musterApi),
    queryFn: () => musterApi!.listInstallations(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  // An installation the person turned off is asked nothing and is no
  // organization source: as if muster did not list it.
  const turnedOff = useTurnedOffInstallations();
  const names = (musterInstallations.data?.installations ?? [])
    .map(installation => installation.name)
    .filter(installation => !turnedOff.includes(installation));
  const availability = useMusterServerAvailability(AGENT_MANAGER_SERVER, names);
  const available = availability.available;

  // The same query, and cache entry, as `useAgentManagerInfo`.
  const infos = useQueries({
    queries: available.map(installation => ({
      queryKey: musterAgentManagerInfoQueryKey(installation),
      enabled: Boolean(musterApi),
      queryFn: () => new AgentManagerClient(musterApi!, installation).getInfo(),
      staleTime: 60_000,
      retry: false,
    })),
  });
  const supported = available.filter(
    (_, index) =>
      infos[index]?.data?.capabilities?.[ORGANIZATIONS_CAPABILITY] === true,
  );
  // Never read, muster's installations leave every installation's answer
  // unknown; a failed refetch keeps the last list, which still decides.
  const listingError = musterInstallations.data
    ? undefined
    : musterInstallations.error?.message;
  // The installations the portal's probe says it cannot reach.
  const probedUnreachable = new Set(
    (musterInstallations.data?.installations ?? [])
      .filter(installation => installation.reachable === false)
      .map(installation => installation.name),
  );
  // Each failure belongs to the installation it is about.
  const installationErrors: Record<
    string,
    { reason: UncheckedReason; message: string }
  > = {};
  const noteUnchecked = (
    installation: string,
    reason: UncheckedReason,
    message = uncheckedMessage(installation, reason),
  ) => {
    installationErrors[installation] = { reason, message };
  };
  for (const installation of names) {
    const presence = availability.presenceOf(installation);
    if (presence === 'unknown' && availability.failedOf(installation)) {
      const error = availability.errorOf(installation);
      const reason = serverListFailureReason(
        error,
        probedUnreachable.has(installation),
      );
      noteUnchecked(
        installation,
        reason,
        uncheckedMessage(installation, reason, error?.message),
      );
    } else if (presence === 'sharedIdentity') {
      noteUnchecked(installation, 'sharedIdentity');
    }
  }
  // The installations whose agent-manager wants the person's sign-in, from
  // its `get_info` or its `list_organizations`.
  const signIns: Record<string, AgentManagerSignIn> = {};
  const noteSignIn = (installation: string, error: unknown) => {
    if (error instanceof AgentManagerNotConnectedError) {
      signIns[installation] = {
        message: error.message,
        signInRequired: error.signInRequired,
      };
    }
  };
  available.forEach((installation, index) => {
    const error = infos[index]?.error;
    if (error) {
      noteUnchecked(
        installation,
        error instanceof AgentManagerNotConnectedError
          ? 'connectorSignIn'
          : 'failed',
        `${installation}: ${error.message}`,
      );
      noteSignIn(installation, error);
    }
  });
  const mine = useQueries({
    queries: supported.map(installation => ({
      queryKey: musterOrganizationsQueryKey(installation),
      enabled: Boolean(musterApi),
      queryFn: () =>
        new AgentManagerClient(musterApi!, installation).listOrganizations(),
      staleTime: 60_000,
      retry: false,
    })),
  });
  supported.forEach((installation, index) =>
    noteSignIn(installation, mine[index]?.error),
  );

  const isListing = Boolean(musterApi) && isAwaitingData(musterInstallations);
  // Each installation whose own reads are still out: its server list, its
  // `get_info`, its `list_organizations`.
  const loadingInstallations = [
    ...names.filter(
      installation =>
        availability.presenceOf(installation) === 'unknown' &&
        !availability.failedOf(installation),
    ),
    ...available.filter((_, index) => isAwaitingData(infos[index])),
    ...supported.filter((_, index) => isAwaitingData(mine[index])),
  ];
  const isLoading =
    isListing ||
    availability.isLoading ||
    infos.some(query => isAwaitingData(query)) ||
    mine.some(query => isAwaitingData(query));
  // Keyed on contents: `useQueries` returns fresh arrays every render.
  const signature = JSON.stringify(
    supported.map((installation, index) => [
      installation,
      mine[index]?.data ?? null,
      mine[index]?.error ? String(mine[index].error.message) : null,
    ]),
  );
  const discoverySignature = JSON.stringify({
    listingError: listingError ?? null,
    // Once muster has listed its installations, one it does not list is
    // unknown, not decided: agent-manager is reached through muster only,
    // so whether it serves organizations there cannot be learned. Without
    // the muster plugin nothing is listed and nothing is held.
    listed: musterInstallations.data ? names : null,
    turnedOff,
    installationErrors,
    signIns,
  });
  const loadingSignature = JSON.stringify([
    isListing,
    [...new Set(loadingInstallations)],
  ]);

  const value = useMemo<OrganizationDirectoryValue>(() => {
    const entries = JSON.parse(signature) as [
      string,
      OrganizationListing | null,
      string | null,
    ][];
    const answers = new Map(
      entries.map(([installation, answer]) => [installation, answer]),
    );
    const failures = new Map(
      entries.map(([installation, , failure]) => [installation, failure]),
    );
    const discovery = JSON.parse(discoverySignature) as {
      listingError: string | null;
      listed: string[] | null;
      turnedOff: string[];
      installationErrors: Record<
        string,
        { reason: UncheckedReason; message: string }
      >;
      signIns: Record<string, AgentManagerSignIn>;
    };
    const unchecked = (discovery.listed ?? [])
      .filter(installation => discovery.installationErrors[installation])
      .map(installation => ({
        installation,
        ...discovery.installationErrors[installation],
      }));
    const [listing, loading] = JSON.parse(loadingSignature) as [
      boolean,
      string[],
    ];
    const directory = new Map<string, OrganizationNamespace>();
    for (const answer of answers.values()) {
      for (const organization of organizationNamespacesOf(
        answer ?? undefined,
      )) {
        directory.set(organization.namespace, organization);
      }
    }
    return {
      directory,
      installations: [...answers.keys()],
      listingError: discovery.listingError ?? undefined,
      uncheckedInstallations: unchecked,
      noneChecked:
        unchecked.length > 0 && unchecked.length === discovery.listed?.length,
      discoveryFailureOf: installation => {
        if (discovery.listingError) {
          return discovery.listingError;
        }
        if (discovery.turnedOff.includes(installation)) {
          return `${installation} is turned off in your Environments settings, so whether it serves organizations is unknown.`;
        }
        if (discovery.listed && !discovery.listed.includes(installation)) {
          return `muster does not list ${installation}, so whether it serves organizations is unknown.`;
        }
        return discovery.installationErrors[installation]?.message;
      },
      signInOf: installation => discovery.signIns[installation],
      organizationsOf: installation => answers.get(installation) ?? undefined,
      failureOf: installation => failures.get(installation) ?? undefined,
      recheck: async installation => {
        await Promise.all([
          // Whether its muster lists agent-manager, when that read failed.
          queryClient.invalidateQueries({
            queryKey: musterServerListQueryKey(installation),
          }),
          queryClient.invalidateQueries({
            queryKey: musterAgentManagerInfoQueryKey(installation),
          }),
          queryClient.refetchQueries({
            queryKey: musterOrganizationsQueryKey(installation),
          }),
        ]);
      },
      isLoading,
      isLoadingOf: installation => listing || loading.includes(installation),
    };
  }, [signature, discoverySignature, loadingSignature, isLoading, queryClient]);

  return (
    <OrganizationDirectoryContext.Provider value={value}>
      {children}
    </OrganizationDirectoryContext.Provider>
  );
}

/** The organizations the person manages or belongs to, as read above. */
export function useOrganizationDirectory(): OrganizationDirectoryValue {
  return useContext(OrganizationDirectoryContext);
}

/** Whether any installation reports support for Agent Platform organizations. */
export function useOrganizationsAvailable(): boolean {
  return useOrganizationDirectory().installations.length > 0;
}

/**
 * Why the directory cannot tell yet whether a namespace on `installation` is
 * an organization's, or `undefined` when it can: still reading, the
 * installation's `list_organizations` failed, or agent-manager could not be
 * reached to learn whether the installation serves organizations at all.
 * Only that installation's own reads and failures count: an installation
 * known not to run agent-manager, or whose agent-manager serves no
 * organizations, is decided; one muster does not list is not.
 * Where it cannot tell, an organization's namespace would pass for the
 * platform's, so a write that must not reach an organization waits.
 */
export function organizationsUndecided(
  value: OrganizationDirectoryValue,
  installation: string,
): string | undefined {
  if (value.isLoadingOf(installation)) {
    return 'The organizations are still being read.';
  }
  const failure = value.failureOf(installation);
  if (failure) {
    return failure;
  }
  if (!value.installations.includes(installation)) {
    return value.discoveryFailureOf(installation);
  }
  return undefined;
}
