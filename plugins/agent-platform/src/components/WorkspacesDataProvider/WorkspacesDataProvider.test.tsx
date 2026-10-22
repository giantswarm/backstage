import { useState } from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MusterApi } from '@giantswarm/backstage-plugin-muster';
import { WorkspaceManagerClient } from '../../apis/WorkspaceManagerClient';
import {
  useAwaitedSync,
  useWorkspaceDetail,
} from '../../hooks/useWorkspaceActions';
import { useSaveWorkspace } from '../../hooks/useWorkspaceEditor';
import { emptySource } from '../../lib/workspaceDraft';
import { SYNC_REFETCH_MS, syncState } from '../../lib/workspaceList';
import type { Workspace } from '../../lib/workspaceManager';
import { CustomizeWorkspacesPanel } from '../CustomizeWorkspacesPanel';
import { WorkspaceOrganizationSelect } from '../WorkspaceOrganizationSelect';
import {
  useWorkspacesData,
  WorkspacesDataProvider,
} from './WorkspacesDataProvider';

function workspace(name: string, organization: string): Workspace {
  return {
    name,
    organization,
    sources: [
      { provider: 'github', owner: 'example-org', repositories: [name] },
    ],
    sync: { schedule: 'nightly' },
    resourceVersion: '1',
    createdAt: '2026-10-01T00:00:00Z',
    lastSync: { time: '2026-10-14T03:00:00Z', result: 'Succeeded' },
    repositories: 1,
    sessions: 0,
  };
}

/** What the person's workspace-manager answers, per installation. */
let mockWorkspaces: Record<string, Workspace[]>;
/** The installations whose muster lists the workspace-manager. */
let mockWithManager: string[];
/**
 * The person's Organizations the manager names, per installation; `undefined`
 * for a manager older than 0.8.0, which names none.
 */
let mockMemberOf: Record<string, string[]> | undefined;
/** The installations the inventory knows to run muster, and whether it still probes. */
let mockMusterInstallations: string[];
let mockProbing: boolean;
/** The installations whose muster does not answer. */
let mockUnreachable: string[];
/** The installations whose muster has no per-user sign-in in this portal. */
let mockSharedIdentity: string[];
/** The workspace-manager's other tools, by name, as the person calls them. */
let mockTools: Record<string, (args: any) => unknown>;

const mockMusterApi = {
  listInstallations: jest.fn(async () => ({
    installations: mockMusterInstallations.map(name => ({
      name,
      requiresAuth: !mockSharedIdentity.includes(name),
    })),
  })),
  listServers: jest.fn(async (installation: string) => {
    if (mockUnreachable.includes(installation)) {
      throw new Error('muster: 503 Service Unavailable');
    }
    return {
      mcpServers: mockWithManager.includes(installation)
        ? [{ name: 'workspace-manager' }]
        : [{ name: 'kubernetes' }],
    };
  }),
  callTool: jest.fn(
    async (tool: string, args: unknown, installation: string) => {
      const other = mockTools[tool.replace('x_workspace-manager_', '')];
      if (other) {
        return other(args);
      }
      if (tool !== 'x_workspace-manager_list_workspaces') {
        throw new Error(`unexpected ${tool}`);
      }
      return {
        workspaces: mockWorkspaces[installation] ?? [],
        ...(mockMemberOf
          ? { organizations: mockMemberOf[installation] ?? [] }
          : {}),
      };
    },
  ),
};

jest.mock('../../hooks/useMusterPluginApi', () => ({
  useMusterPluginApi: () => mockMusterApi,
}));
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallationInventory: () => ({
    installationsWith: () => mockMusterInstallations,
    isLoading: false,
    isProbing: mockProbing,
  }),
  useInstallationScope: () => ({ scope: 'all' }),
  applyInstallationScope: (installations: string[]) => installations,
}));

function Availability() {
  const { isAvailable } = useWorkspacesData();
  return <p>{`available: ${String(isAvailable)}`}</p>;
}

/** Creates `platform-mcp`, or with `edit` saves a change to it, as the editor does. */
function SaveButton({ edit }: { edit?: { resourceVersion: string } }) {
  const save = useSaveWorkspace(
    new WorkspaceManagerClient(
      mockMusterApi as unknown as MusterApi,
      'gazelle',
    ),
  );
  return (
    <button
      onClick={() =>
        save.mutate({
          draft: {
            name: 'platform-mcp',
            sources: [{ ...emptySource('github'), owner: 'example-org' }],
            minimumGiB: '',
            headroom: '',
          },
          organization: 'alpha',
          edit,
        })
      }
    >
      {edit ? 'Save changes' : 'Create workspace'}
    </button>
  );
}

/** What the workspace's page says of its sync, from its own read, once opened. */
function PageSyncState({ name }: { name: string }) {
  const [isOpen, setOpen] = useState(false);
  return isOpen ? (
    <OpenPageSyncState name={name} />
  ) : (
    <button onClick={() => setOpen(true)}>Open {name}</button>
  );
}

function OpenPageSyncState({ name }: { name: string }) {
  const detail = useWorkspaceDetail('gazelle', name, true, {
    followSync: true,
  });
  const awaited = useAwaitedSync('gazelle', name);
  const read = detail.data?.workspace;
  return <p>{`page: ${read ? syncState(read, awaited).label : '…'}`}</p>;
}

function renderWorkspaces(extra: JSX.Element | null = null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <QueryClientProvider client={queryClient}>
      <WorkspacesDataProvider>
        <Availability />
        <WorkspaceOrganizationSelect />
        <CustomizeWorkspacesPanel search="" />
        {extra}
      </WorkspacesDataProvider>
    </QueryClientProvider>,
  );
}

/** The Last synchronization of a workspace's row. */
const rowState = (name: string) =>
  within(screen.getByRole('row', { name: new RegExp(name) }));

const listReads = () =>
  mockMusterApi.callTool.mock.calls.filter(
    ([tool]) => tool === 'x_workspace-manager_list_workspaces',
  ).length;

const shownNames = () =>
  screen
    .getAllByRole('rowheader')
    .map(cell => within(cell).getAllByText(/./)[0].textContent);

describe('WorkspacesDataProvider', () => {
  beforeEach(() => {
    mockWithManager = ['gazelle'];
    mockWorkspaces = {
      gazelle: [workspace('docs', 'alpha'), workspace('mcp', 'beta')],
    };
    mockMemberOf = { gazelle: ['alpha', 'beta'] };
    mockMusterInstallations = ['gazelle'];
    mockProbing = false;
    mockUnreachable = [];
    mockSharedIdentity = [];
    mockTools = {};
    jest.clearAllMocks();
  });

  it('is not available where no installation in scope has the workspace-manager', async () => {
    mockWithManager = [];
    await renderWorkspaces();

    expect(await screen.findByText('available: false')).toBeInTheDocument();
    expect(mockMusterApi.callTool).not.toHaveBeenCalled();
  });

  it('is not available, and says why, where muster has no per-user sign-in', async () => {
    mockSharedIdentity = ['gazelle'];
    await renderWorkspaces();

    expect(await screen.findByText('available: false')).toBeInTheDocument();
    expect(
      screen.getByText('Workspaces cannot be used on gazelle from this portal'),
    ).toBeInTheDocument();
    expect(mockMusterApi.callTool).not.toHaveBeenCalled();
  });

  it('is not known yet while the inventory still probes for muster', async () => {
    mockMusterInstallations = [];
    mockProbing = true;
    await renderWorkspaces();

    expect(await screen.findByText('available: undefined')).toBeInTheDocument();
  });

  it('is not known, and says why, where no muster answered', async () => {
    mockUnreachable = ['gazelle'];
    await renderWorkspaces();

    expect(
      await screen.findByText('Your workspaces could not be read'),
    ).toBeInTheDocument();
    expect(screen.getByText('available: undefined')).toBeInTheDocument();
    expect(screen.queryByText('Workspaces are not available here')).toBeNull();
  });

  it('offers no Organization scope to a person in one Organization', async () => {
    mockWorkspaces = { gazelle: [workspace('docs', 'alpha')] };
    mockMemberOf = { gazelle: ['alpha'] };
    await renderWorkspaces();

    await waitFor(() => expect(shownNames()).toEqual(['docs']));
    expect(screen.getByText('available: true')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Organization/ })).toBeNull();
  });

  it('switches the table to the Organization picked, for a person in two', async () => {
    await renderWorkspaces();

    await waitFor(() => expect(shownNames()).toEqual(['docs']));
    await userEvent.click(screen.getByRole('button', { name: /Organization/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'beta' }));

    await waitFor(() => expect(shownNames()).toEqual(['mcp']));
  });

  it('offers an Organization without a workspace yet where the manager names the person a member, in one call', async () => {
    mockWorkspaces = { gazelle: [workspace('docs', 'alpha')] };
    mockMemberOf = { gazelle: ['alpha', 'gamma'] };
    await renderWorkspaces();

    await waitFor(() => expect(shownNames()).toEqual(['docs']));
    await userEvent.click(screen.getByRole('button', { name: /Organization/ }));
    const options = (await screen.findAllByRole('option')).map(
      option => option.textContent,
    );
    expect(options).toEqual(['alpha', 'gamma']);

    await userEvent.click(screen.getByRole('option', { name: 'gamma' }));
    expect(
      await screen.findByText('No workspaces in gamma yet'),
    ).toBeInTheDocument();
    expect(mockMusterApi.callTool).toHaveBeenCalledTimes(1);
  });

  it('offers the workspaces’ own Organizations from a manager that names none', async () => {
    mockMemberOf = undefined;
    await renderWorkspaces();

    await waitFor(() => expect(shownNames()).toEqual(['docs']));
    await userEvent.click(screen.getByRole('button', { name: /Organization/ }));
    const options = (await screen.findAllByRole('option')).map(
      option => option.textContent,
    );
    expect(options).toEqual(['alpha', 'beta']);
  });

  describe('following a synchronization', () => {
    beforeEach(() => {
      jest.useFakeTimers({ advanceTimers: true });
      mockMemberOf = { gazelle: ['alpha'] };
      mockWorkspaces = { gazelle: [workspace('docs', 'alpha')] };
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    const tick = (ms: number) =>
      act(async () => {
        await jest.advanceTimersByTimeAsync(ms);
      });

    it('shows a workspace just created as Synchronizing, reads again until it is Synchronized, then stops', async () => {
      const created: Workspace = {
        ...workspace('platform-mcp', 'alpha'),
        createdAt: new Date().toISOString(),
        lastSync: undefined,
      };
      mockTools.create_workspace = () => {
        mockWorkspaces.gazelle = [...mockWorkspaces.gazelle, created];
        return created;
      };
      await renderWorkspaces(<SaveButton />);
      await waitFor(() => expect(shownNames()).toEqual(['docs']));

      await userEvent.click(
        screen.getByRole('button', { name: 'Create workspace' }),
      );

      // The manager has not started its first synchronization yet.
      await waitFor(() =>
        expect(
          rowState('platform-mcp').getByText('Synchronizing'),
        ).toBeInTheDocument(),
      );
      expect(screen.queryByText('Not synchronized yet')).toBeNull();

      // It runs…
      created.activeSync = {
        job: 'sync-1',
        startedAt: new Date().toISOString(),
      };
      await tick(SYNC_REFETCH_MS);
      expect(
        rowState('platform-mcp').getByText('Synchronizing'),
      ).toBeInTheDocument();

      // …and ends.
      delete created.activeSync;
      created.lastSync = {
        time: new Date().toISOString(),
        result: 'Succeeded',
      };
      await tick(SYNC_REFETCH_MS);
      await waitFor(() =>
        expect(
          rowState('platform-mcp').getByText('Synchronized'),
        ).toBeInTheDocument(),
      );

      // Nothing syncs any more: the list is not read again.
      const reads = listReads();
      await tick(10 * SYNC_REFETCH_MS);
      expect(listReads()).toBe(reads);
    });

    it('says Synchronizing after a saved change until the read shows its synchronization ended', async () => {
      const docs = workspace('docs', 'alpha');
      mockWorkspaces = { gazelle: [docs] };
      mockTools.update_workspace = () => ({ ...docs, resourceVersion: '2' });
      await renderWorkspaces(<SaveButton edit={{ resourceVersion: '1' }} />);
      await waitFor(() =>
        expect(rowState('docs').getByText('Synchronized')).toBeInTheDocument(),
      );
      const reads = listReads();

      await userEvent.click(
        screen.getByRole('button', { name: 'Save changes' }),
      );

      // The read after the save still shows the last synchronization before
      // it, and nothing running.
      await waitFor(() => expect(listReads()).toBeGreaterThan(reads));
      expect(rowState('docs').getByText('Synchronizing')).toBeInTheDocument();

      docs.lastSync = { time: new Date().toISOString(), result: 'Failed' };
      docs.lastSync.message = 'owner not reachable';
      await tick(SYNC_REFETCH_MS);
      await waitFor(() =>
        expect(rowState('docs').getByText('Failed')).toBeInTheDocument(),
      );
    });

    it('says Synchronizing in the row and on the page alike, from the page’s read on', async () => {
      const docs = workspace('docs', 'alpha');
      mockWorkspaces = { gazelle: [docs] };
      mockTools.get_workspace = () => ({
        workspace: {
          ...docs,
          activeSync: { job: 'sync-2', startedAt: new Date().toISOString() },
        },
        mirrors: [],
        storage: { mirrorsBytes: 0, sessionsBytes: 0 },
        sessionDirectories: [],
      });
      await renderWorkspaces(<PageSyncState name="docs" />);
      await waitFor(() =>
        expect(rowState('docs').getByText('Synchronized')).toBeInTheDocument(),
      );
      const reads = listReads();

      await userEvent.click(screen.getByRole('button', { name: 'Open docs' }));

      expect(
        await screen.findByText('page: Synchronizing'),
      ).toBeInTheDocument();
      // The list follows the page's read, not its own older one.
      await waitFor(() =>
        expect(rowState('docs').getByText('Synchronizing')).toBeInTheDocument(),
      );
      expect(screen.queryByText('Synchronized')).toBeNull();
      expect(listReads()).toBe(reads);
    });
  });
});
