import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueries, useQueryClient } from '@tanstack/react-query';
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
  classifyWorkspaceManagerError,
  WORKSPACE_MANAGER_SERVER,
  type Workspace,
} from '../../lib/workspaceManager';

/** The address's Organization scope: `?organization=<name>`. */
export const ORGANIZATION_SEARCH_PARAM = 'organization';

/** How often the list is read again while a row syncs or is deleted. */
const SETTLING_REFETCH_MS = 5_000;

export type WorkspacesData = {
  /**
   * Whether an installation in scope offers workspaces (its muster lists the
   * workspace-manager); `undefined` until one does or every one answered.
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
 * `list_workspaces` is called as the person, without an Organization: the
 * manager answers the workspaces of every Organization the person is a member
 * of. The Organizations offered are those, and the installation's
 * Organization resources the person is a member of without a workspace yet:
 * each is asked for its workspaces, and the manager's membership refusal
 * keeps it out. Nothing is offered that the manager would refuse.
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
  });

  const allRows = useMemo(
    () =>
      installations.flatMap((installation, index) =>
        (lists[index]?.data ?? []).map(workspace => ({
          ...workspace,
          installation,
          id: workspaceRowId({ installation, name: workspace.name }),
        })),
      ),
    // `useQueries` returns a fresh array each render; key on the data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [installations.join(','), ...lists.map(list => list.data)],
  );

  // The installation's Organizations, as far as the person may read them;
  // those without a workspace of theirs are asked about below.
  const { resources: organizationResources } = useResources(
    installations,
    Organization,
    {},
    { enabled: installations.length > 0 },
  );
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
  const memberships = useQueries({
    queries: candidates.map(({ installation, organization }) => ({
      queryKey: musterWorkspacesQueryKey(installation, organization),
      enabled: Boolean(musterApi),
      queryFn: () =>
        new WorkspaceManagerClient(musterApi!, installation).listWorkspaces(
          organization,
        ),
      retry: false,
      staleTime: 60_000,
    })),
  });

  const memberSignature = candidates
    .filter((_, index) => memberships[index]?.isSuccess)
    .map(candidate => candidate.organization)
    .join(',');
  const organizations = useMemo(
    () =>
      [
        ...new Set([
          ...allRows.map(row => row.organization),
          ...(memberSignature ? memberSignature.split(',') : []),
        ]),
      ].sort((a, b) => a.localeCompare(b)),
    [allRows, memberSignature],
  );

  const queryClient = useQueryClient();
  const retry = useCallback(() => {
    // The server lists too: an installation whose muster did not answer is
    // asked again whether it has the workspace-manager.
    for (const prefix of ['workspaces', 'mcp-servers']) {
      void queryClient.invalidateQueries({
        queryKey: ['muster', 'agent-platform', prefix],
      });
    }
  }, [queryClient]);

  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get(ORGANIZATION_SEARCH_PARAM);
  const organization =
    requested && organizations.includes(requested)
      ? requested
      : organizations[0];
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

  const failureSignature = [
    ...installations.flatMap((installation, index) => {
      const error = lists[index]?.error;
      return error
        ? [[installation, classifyWorkspaceManagerError(error).message]]
        : [];
    }),
    // An installation whose muster did not answer cannot say whether it
    // has workspaces: a gap in the list, not an empty one.
    ...(availability.isLoading
      ? []
      : scoped
          .filter(
            installation =>
              availability.presenceOf(installation) === 'unknown',
          )
          .map(installation => [
            installation,
            'Its muster could not be reached.',
          ])),
  ]
    .map(pair => pair.join('\u0000'))
    .join('\u0001');

  const value = useMemo<WorkspacesData>(() => {
    const failures = Object.fromEntries(
      failureSignature
        ? failureSignature
            .split('\u0001')
            .map(pair => pair.split('\u0000') as [string, string])
        : [],
    );
    const isLoading =
      availability.isLoading || lists.some(list => isAwaitingData(list));
    let isAvailable: boolean | undefined;
    if (installations.length > 0) {
      isAvailable = true;
    } else if (!availability.isLoading && !inventory.isLoading) {
      isAvailable = false;
    }
    return {
      isAvailable,
      installations,
      organizations,
      organization,
      setOrganization,
      rows: allRows
        .filter(row => row.organization === organization)
        .sort(
          (a, b) =>
            a.name.localeCompare(b.name) ||
            a.id.localeCompare(b.id),
        ),
      isLoading,
      failures,
      retry,
    };
    // `lists` is captured by `allRows` and the signatures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    allRows,
    availability.isLoading,
    failureSignature,
    installations,
    inventory.isLoading,
    organization,
    organizations,
    setOrganization,
    retry,
    lists.some(list => isAwaitingData(list)),
  ]);

  return (
    <WorkspacesDataContext.Provider value={value}>
      {children}
    </WorkspacesDataContext.Provider>
  );
}
