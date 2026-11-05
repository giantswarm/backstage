import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  QueryClientContext,
  useQueries,
  useQuery,
} from '@tanstack/react-query';
import { musterInstallationsQueryKey } from '@giantswarm/backstage-plugin-muster';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import { AgentManagerClient } from '../../apis/AgentManagerClient';
import { AGENT_MANAGER_SERVER } from '../../lib/agentManager';
import { useMusterPluginApi } from '../../hooks/useMusterPluginApi';
import { useMusterServerAvailability } from '../../hooks/useMusterServerAvailability';
import {
  musterAgentManagerInfoQueryKey,
  musterMyOrganizationsQueryKey,
} from '../../lib/queryKeys';
import {
  EMPTY_ORGANIZATION_DIRECTORY,
  ORGANIZATIONS_CAPABILITY,
  type MyOrganizations,
  type OrganizationDirectory,
  type OrganizationNamespace,
} from '../../lib/organizations';

export type OrganizationDirectoryValue = {
  /** Which organization each namespace is, on every installation read. */
  directory: OrganizationDirectory;
  /**
   * The installations whose agent-manager serves the organization tools,
   * in the order the portal lists them.
   */
  installations: string[];
  /** The person's organizations on one installation, once answered. */
  organizationsOf: (installation: string) => MyOrganizations | undefined;
  /** Why an installation's organizations could not be read, if they could not. */
  failureOf: (installation: string) => string | undefined;
  /** True while an installation's answer is still to come. */
  isLoading: boolean;
};

const EMPTY: OrganizationDirectoryValue = {
  directory: EMPTY_ORGANIZATION_DIRECTORY,
  installations: [],
  organizationsOf: () => undefined,
  failureOf: () => undefined,
  isLoading: false,
};

const OrganizationDirectoryContext =
  createContext<OrganizationDirectoryValue>(EMPTY);

/**
 * Reads, on every installation whose agent-manager reports the
 * `organizations` capability, the organizations the signed-in person belongs
 * to (`list_my_organizations`, as the person). What every page below names
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
  // Without a query client (a page rendered outside the plugin's own, as
  // in a component's test) nothing is read and no namespace is an
  // organization.
  if (!useContext(QueryClientContext)) {
    return <>{children}</>;
  }
  return <ReadOrganizationDirectory>{children}</ReadOrganizationDirectory>;
}

function ReadOrganizationDirectory({ children }: { children: ReactNode }) {
  const musterApi = useMusterPluginApi();
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
  const mine = useQueries({
    queries: supported.map(installation => ({
      queryKey: musterMyOrganizationsQueryKey(installation),
      enabled: Boolean(musterApi),
      queryFn: () =>
        new AgentManagerClient(musterApi!, installation).listMyOrganizations(),
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

  const value = useMemo<OrganizationDirectoryValue>(() => {
    const entries = JSON.parse(signature) as [
      string,
      MyOrganizations | null,
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
      for (const organization of answer?.organizations ?? []) {
        directory.set(organization.namespace, organization);
      }
    }
    return {
      directory,
      installations: [...answers.keys()],
      organizationsOf: installation => answers.get(installation) ?? undefined,
      failureOf: installation => failures.get(installation) ?? undefined,
      isLoading,
    };
  }, [signature, isLoading]);

  return (
    <OrganizationDirectoryContext.Provider value={value}>
      {children}
    </OrganizationDirectoryContext.Provider>
  );
}

/** The organizations the person belongs to, as the provider above read them. */
export function useOrganizationDirectory(): OrganizationDirectoryValue {
  return useContext(OrganizationDirectoryContext);
}
