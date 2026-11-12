import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  QueryClientContext,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- Muster owns the shared installation query key.
import {
  musterInstallationsQueryKey,
  useMusterServerAvailability,
} from '@giantswarm/backstage-plugin-muster';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import { AgentManagerClient } from '../../apis/AgentManagerClient';
import { AGENT_MANAGER_SERVER } from '../../lib/agentManager';
import { useMusterPluginApi } from '../../hooks/useMusterPluginApi';
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
  /** Failures checking whether installations serve organizations. */
  discoveryErrors: string[];
  /** The person's organizations on one installation, once answered. */
  organizationsOf: (installation: string) => OrganizationListing | undefined;
  /** Why an installation's organizations could not be read, if they could not. */
  failureOf: (installation: string) => string | undefined;
  /** Reads an installation's organizations again (Check again). */
  recheck: (installation: string) => Promise<void>;
  /** True while an installation's answer is still to come. */
  isLoading: boolean;
};

const EMPTY: OrganizationDirectoryValue = {
  directory: EMPTY_ORGANIZATION_DIRECTORY,
  installations: [],
  discoveryErrors: [],
  organizationsOf: () => undefined,
  failureOf: () => undefined,
  recheck: async () => {},
  isLoading: false,
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
  const names = (musterInstallations.data?.installations ?? []).map(
    installation => installation.name,
  );
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
  const discoveryErrors = [
    ...(musterInstallations.error ? [musterInstallations.error.message] : []),
    ...names.flatMap(installation => {
      const presence = availability.presenceOf(installation);
      if (presence === 'unknown' && !availability.isLoading) {
        return [
          `Could not reach agent-manager on ${installation}. Check your connector sign-in and try again.`,
        ];
      }
      if (presence === 'sharedIdentity') {
        return [
          `${installation} needs a per-user connector sign-in to read organizations.`,
        ];
      }
      return [];
    }),
    ...available.flatMap((installation, index) =>
      infos[index]?.error
        ? [`${installation}: ${infos[index].error.message}`]
        : [],
    ),
  ];
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

  const isLoading =
    (Boolean(musterApi) && isAwaitingData(musterInstallations)) ||
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
  const discoverySignature = JSON.stringify(discoveryErrors);

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
      discoveryErrors: JSON.parse(discoverySignature) as string[],
      organizationsOf: installation => answers.get(installation) ?? undefined,
      failureOf: installation => failures.get(installation) ?? undefined,
      recheck: installation =>
        queryClient.refetchQueries({
          queryKey: musterOrganizationsQueryKey(installation),
        }),
      isLoading,
    };
  }, [signature, discoverySignature, isLoading, queryClient]);

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
 * Where it cannot tell, an organization's namespace would pass for the
 * platform's, so a write that must not reach an organization waits.
 */
export function organizationsUndecided(
  value: OrganizationDirectoryValue,
  installation: string,
): string | undefined {
  if (value.isLoading) {
    return 'The organizations are still being read.';
  }
  const failure = value.failureOf(installation);
  if (failure) {
    return failure;
  }
  if (!value.installations.includes(installation)) {
    return value.discoveryErrors[0];
  }
  return undefined;
}
