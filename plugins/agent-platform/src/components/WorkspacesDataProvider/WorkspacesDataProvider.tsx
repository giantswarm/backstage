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
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';

import { WorkspaceManagerClient } from '../../apis/WorkspaceManagerClient';
import { useMusterPluginApi } from '../../hooks/useMusterPluginApi';
import { useMusterServerAvailability } from '../../hooks/useMusterServerAvailability';
import { useAwaitedSyncs } from '../../hooks/useWorkspaceActions';
import { forgetEndedSyncs } from '../../lib/awaitedSyncs';
import { musterWorkspacesQueryKey } from '../../lib/queryKeys';
import {
  workspaceRowId,
  workspacesRefetchInterval,
  type WorkspaceRow,
} from '../../lib/workspaceList';
import {
  WORKSPACE_MANAGER_SERVER,
  type WorkspaceList,
} from '../../lib/workspaceManager';

/** The address's Organization scope: `?organization=<name>`. */
export const ORGANIZATION_SEARCH_PARAM = 'organization';

export type WorkspacesData = {
  /**
   * Whether an installation in scope offers workspaces (its muster lists the
   * workspace-manager); `undefined` until one does or every one answered
   * without it, so also while a muster did not answer (see `failures`).
   */
  isAvailable: boolean | undefined;
  /**
   * The installations in scope whose muster lists the workspace-manager and
   * reaches it as the person.
   */
  installations: string[];
  /**
   * The installations in scope whose muster lists the workspace-manager but
   * has no per-user sign-in in this portal: left out like an absent manager,
   * and named so the tab can say why.
   */
  sharedIdentity: string[];
  /** The Organizations the person is a member of, by name. */
  organizations: string[];
  /** The scope's Organization; `undefined` while there is none. */
  organization: string | undefined;
  setOrganization: (organization: string) => void;
  /**
   * The scope's workspaces, every installation's, each with the sync the
   * person started on it here (`awaitedSync`).
   */
  rows: WorkspaceRow[];
  /** Some installation's list has not answered yet. */
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
 * `list_workspaces` is called once per installation as the person, without an
 * Organization: the manager answers the workspaces of every Organization the
 * person is a member of, and those Organizations, with or without a workspace.
 * They are the Organizations offered: nothing the manager would refuse.
 *
 * A list is read again while one of its workspaces syncs, was just created or
 * changed, or is being deleted (`workspacesRefetchInterval`), never while the
 * tab is hidden; coming back to the tab then reads it at once.
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
  const sharedIdentityKey = availability.isLoading
    ? ''
    : availability.sharedIdentity.join(',');
  const sharedIdentity = useMemo(
    () => (sharedIdentityKey ? sharedIdentityKey.split(',') : []),
    [sharedIdentityKey],
  );

  const queryClient = useQueryClient();
  const awaited = useAwaitedSyncs();
  const combineLists = useCallback(
    (results: UseQueryResult<WorkspaceList>[]) => ({
      rows: installations.flatMap((installation, index) =>
        (results[index]?.data?.workspaces ?? []).map(workspace => ({
          ...workspace,
          installation,
          id: workspaceRowId({ installation, name: workspace.name }),
        })),
      ),
      organizations: [
        ...new Set(results.flatMap(result => result.data?.organizations ?? [])),
      ].sort((a, b) => a.localeCompare(b)),
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
  const refetchInterval = (
    installation: string,
    list: WorkspaceList | undefined,
  ) =>
    workspacesRefetchInterval(
      list?.workspaces ?? [],
      workspace =>
        awaited[workspaceRowId({ installation, name: workspace.name })],
    );
  const lists = useQueries({
    queries: installations.map(installation => ({
      queryKey: musterWorkspacesQueryKey(installation),
      enabled: Boolean(musterApi),
      queryFn: async () => {
        const list = await new WorkspaceManagerClient(
          musterApi!,
          installation,
        ).listWorkspaces();
        forgetEndedSyncs(queryClient, installation, list.workspaces);
        return list;
      },
      retry: false,
      refetchInterval: (query: { state: { data?: WorkspaceList } }) =>
        refetchInterval(installation, query.state.data),
      refetchOnWindowFocus: (query: { state: { data?: WorkspaceList } }) =>
        refetchInterval(installation, query.state.data) ? 'always' : false,
    })),
    combine: combineLists,
  });
  const allRows = lists.rows;
  const organizations = lists.organizations;

  const retry = useCallback(() => {
    for (const installation of installations) {
      void queryClient.invalidateQueries({
        queryKey: musterWorkspacesQueryKey(installation),
      });
    }
    // An installation whose muster did not answer is asked again whether it
    // has the workspace-manager.
    void queryClient.invalidateQueries({
      queryKey: ['muster', 'agent-platform', 'mcp-servers'],
    });
  }, [queryClient, installations]);

  const isInventoryPending = inventory.isLoading || inventory.isProbing;
  const isLoading = availability.isLoading || lists.isAwaiting;

  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get(ORGANIZATION_SEARCH_PARAM);
  let organization: string | undefined;
  if (requested && organizations.includes(requested)) {
    organization = requested;
  } else if (!lists.isAwaiting) {
    // Only once every installation answered: the address's Organization, or
    // one before it, may still be named.
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
      sharedIdentity,
      organizations,
      organization,
      setOrganization,
      rows: allRows
        .filter(row => row.organization === organization)
        .map(row =>
          awaited[row.id] ? { ...row, awaitedSync: awaited[row.id] } : row,
        )
        .sort(
          (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
        ),
      isLoading,
      failures,
      retry,
    }),
    [
      allRows,
      awaited,
      failures,
      installations,
      isAvailable,
      isLoading,
      organization,
      organizations,
      setOrganization,
      sharedIdentity,
      retry,
    ],
  );

  return (
    <WorkspacesDataContext.Provider value={value}>
      {children}
    </WorkspacesDataContext.Provider>
  );
}
