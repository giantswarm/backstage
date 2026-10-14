import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useQueries,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  applyInstallationScope,
  useInstallationInventory,
  useInstallationScope,
} from '@giantswarm/backstage-plugin-gs';
import {
  Organization,
  useResources,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import { WorkspaceManagerClient } from '../../apis/WorkspaceManagerClient';
import { useMusterPluginApi } from '../../hooks/useMusterPluginApi';
import { useMusterServerAvailability } from '../../hooks/useMusterServerAvailability';
import { musterWorkspacesQueryKey } from '../../lib/queryKeys';
import {
  isSettling,
  workspaceRowId,
  type WorkspaceRow,
} from '../../lib/workspaceList';
import {
  WORKSPACE_MANAGER_SERVER,
  type Workspace,
} from '../../lib/workspaceManager';

/** The address's Organization scope: `?organization=<name>`. */
export const ORGANIZATION_SEARCH_PARAM = 'organization';

/** How often the list is read again while a row syncs or is deleted. */
const SETTLING_REFETCH_MS = 5_000;

/** How long an Organization's membership answer is taken as current. */
const MEMBERSHIP_STALE_MS = 5 * 60_000;

export type WorkspacesData = {
  /**
   * Whether an installation in scope offers workspaces (its muster lists the
   * workspace-manager); `undefined` until one does or every one answered
   * without it, so also while a muster did not answer (see `failures`).
   */
  isAvailable: boolean | undefined;
  /** The installations in scope whose muster lists the workspace-manager. */
  installations: string[];
  /** The Organizations the person is a member of, by name. */
  organizations: string[];
  /** The scope's Organization; `undefined` while there is none. */
  organization: string | undefined;
  setOrganization: (organization: string) => void;
  /** The scope's workspaces, every installation's. */
  rows: WorkspaceRow[];
  /**
   * Some installation's list, the Organizations or a membership has not
   * answered yet.
   */
  isLoading: boolean;
  /** Why an installation's workspaces could not be read, by installation. */
  failures: Record<string, string>;
  /** Reads every installation's workspaces again. */
  retry: () => void;
};

const WorkspacesDataContext = createContext<WorkspacesData | undefined>(
  undefined,
);

export function useWorkspacesData(): WorkspacesData {
  const value = useContext(WorkspacesDataContext);
  if (!value) {
    throw new Error('WorkspacesDataContext not available');
  }
  return value;
}

/**
 * The person's workspaces on the installations in the section's scope whose
 * muster lists the workspace-manager, and the Organization scope over them.
 *
 * `list_workspaces` is called as the person, without an Organization: the
 * manager answers the workspaces of every Organization the person is a member
 * of. The Organizations offered are those, and the installation's
 * Organization resources the person is a member of without a workspace yet:
 * each is asked for its workspaces, and the manager's membership refusal
 * keeps it out. Nothing is offered that the manager would refuse. A person who
 * may not list the installation's Organizations sees an Organization only once
 * it has a workspace, until the manager names the caller's Organizations.
 *
 * Must be mounted inside the plugin's `QueryClientProvider`.
 */
export function WorkspacesDataProvider({ children }: { children: ReactNode }) {
  const musterApi = useMusterPluginApi();
  const inventory = useInstallationInventory();
  const { scope } = useInstallationScope();
  const scoped = applyInstallationScope(
    inventory.installationsWith('muster'),
    scope,
  );
  const availability = useMusterServerAvailability(
    WORKSPACE_MANAGER_SERVER,
    scoped,
  );
  const installations = availability.available;

  const combineLists = useCallback(
    (results: UseQueryResult<Workspace[]>[]) => ({
      rows: installations.flatMap((installation, index) =>
        (results[index]?.data ?? []).map(workspace => ({
          ...workspace,
          installation,
          id: workspaceRowId({ installation, name: workspace.name }),
        })),
      ),
      errors: Object.fromEntries(
        installations.flatMap((installation, index) => {
          const error = results[index]?.error;
          return error ? [[installation, error.message]] : [];
        }),
      ) as Record<string, string>,
      isAwaiting: results.some(result => isAwaitingData(result)),
    }),
    [installations],
  );
  const lists = useQueries({
    queries: installations.map(installation => ({
      queryKey: musterWorkspacesQueryKey(installation),
      enabled: Boolean(musterApi),
      queryFn: () =>
        new WorkspaceManagerClient(musterApi!, installation).listWorkspaces(),
      retry: false,
      refetchInterval: (query: { state: { data?: Workspace[] } }) =>
        query.state.data?.some(isSettling) ? SETTLING_REFETCH_MS : false,
    })),
    combine: combineLists,
  });
  const allRows = lists.rows;

  // The installation's Organizations, as far as the person may read them;
  // those without a workspace of theirs are asked about below.
  const organizationsRead = useResources(
    installations,
    Organization,
    {},
    { enabled: installations.length > 0 },
  );
  const organizationResources = organizationsRead.resources;
  const candidates = useMemo(() => {
    const listed = new Set(
      allRows.map(row => `${row.installation}/${row.organization}`),
    );
    return organizationResources
      .map(resource => ({
        installation: resource.cluster,
        organization: resource.getName(),
      }))
      .filter(
        ({ installation, organization }) =>
          !listed.has(`${installation}/${organization}`),
      );
  }, [organizationResources, allRows]);
  const combineMemberships = useCallback(
    (results: UseQueryResult<Workspace[]>[]) => ({
      // The manager refuses a person outside the Organization: an answer is
      // membership.
      organizations: candidates
        .filter((_, index) => results[index]?.isSuccess)
        .map(candidate => candidate.organization),
      isAwaiting: results.some(result => isAwaitingData(result)),
    }),
    [candidates],
  );
  const memberships = useQueries({
    queries: candidates.map(({ installation, organization }) => ({
      queryKey: musterWorkspacesQueryKey(installation, organization),
      enabled: Boolean(musterApi),
      queryFn: () =>
        new WorkspaceManagerClient(musterApi!, installation).listWorkspaces(
          organization,
        ),
      retry: false,
      // Membership changes rarely; a refusal is an answer too, not asked
      // again on every visit.
      staleTime: MEMBERSHIP_STALE_MS,
      retryOnMount: false,
    })),
    combine: combineMemberships,
  });

  const organizations = useMemo(
    () =>
      [
        ...new Set([
          ...allRows.map(row => row.organization),
          ...memberships.organizations,
        ]),
      ].sort((a, b) => a.localeCompare(b)),
    [allRows, memberships.organizations],
  );

  const queryClient = useQueryClient();
  const retry = useCallback(() => {
    for (const installation of installations) {
      void queryClient.invalidateQueries({
        queryKey: musterWorkspacesQueryKey(installation),
        exact: true,
      });
    }
    // An installation whose muster did not answer is asked again whether it
    // has the workspace-manager.
    void queryClient.invalidateQueries({
      queryKey: ['muster', 'agent-platform', 'mcp-servers'],
    });
  }, [queryClient, installations]);

  const isInventoryPending = inventory.isLoading || inventory.isProbing;
  const isOrganizationsPending =
    lists.isAwaiting ||
    memberships.isAwaiting ||
    (installations.length > 0 && organizationsRead.isLoading);
  const isLoading = availability.isLoading || isOrganizationsPending;

  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get(ORGANIZATION_SEARCH_PARAM);
  let organization: string | undefined;
  if (requested && organizations.includes(requested)) {
    organization = requested;
  } else if (!isOrganizationsPending) {
    // Only once every membership is known: the address's Organization, or
    // one before it, may still be confirmed.
    organization = organizations[0];
  }
  const setOrganization = useCallback(
    (next: string) =>
      setSearchParams(
        params => {
          params.set(ORGANIZATION_SEARCH_PARAM, next);
          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  // An installation whose muster did not answer cannot say whether it has
  // workspaces: a gap in the list, not an empty one.
  const unreachable = availability.isLoading
    ? []
    : scoped.filter(
        installation => availability.presenceOf(installation) === 'unknown',
      );
  const unreachableKey = unreachable.join(',');
  const failures = useMemo(
    () => ({
      ...lists.errors,
      ...Object.fromEntries(
        (unreachableKey ? unreachableKey.split(',') : []).map(installation => [
          installation,
          'Its muster could not be reached.',
        ]),
      ),
    }),
    [lists.errors, unreachableKey],
  );

  let isAvailable: boolean | undefined;
  if (installations.length > 0) {
    isAvailable = true;
  } else if (
    !availability.isLoading &&
    !isInventoryPending &&
    unreachable.length === 0
  ) {
    // Only once every installation's muster answered without it: while the
    // inventory still probes, or a muster did not answer, it may be there,
    // and a deep link to the tab must not be told otherwise.
    isAvailable = false;
  }

  const value = useMemo<WorkspacesData>(
    () => ({
      isAvailable,
      installations,
      organizations,
      organization,
      setOrganization,
      rows: allRows
        .filter(row => row.organization === organization)
        .sort(
          (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
        ),
      isLoading,
      failures,
      retry,
    }),
    [
      allRows,
      failures,
      installations,
      isAvailable,
      isLoading,
      organization,
      organizations,
      setOrganization,
      retry,
    ],
  );

  return (
    <WorkspacesDataContext.Provider value={value}>
      {children}
    </WorkspacesDataContext.Provider>
  );
}
