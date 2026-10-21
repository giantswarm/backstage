import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import {
  WorkspaceManagerError,
  type WorkspaceDetail,
} from '../../lib/workspaceManager';
import { sessionsRouteRef, workspacesRouteRef } from '../../routes';
import { WorkspaceDetailRoute } from './WorkspaceDetailPage';

const mockCaller = 'me@example.com';
jest.mock('../../hooks/useKagentCapabilities', () => ({
  useKagentCapabilitiesMap: () => () => ({
    isUserScoped: true,
    caller: mockCaller,
  }),
}));
// The muster plugin, signed in to workspace-manager.
let mockMusterApi: object | undefined;
jest.mock('../../hooks/useMusterPluginApi', () => ({
  useMusterPluginApi: () => mockMusterApi,
}));
jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  useServerSignIn: () => ({ needsLogin: false }),
  ServerSignIn: () => null,
}));
let mockPresence: string;
jest.mock('../../hooks/useWorkspaceManager', () => ({
  useWorkspaceManagerAvailability: () => ({
    presence: mockPresence,
    isAvailable: mockPresence === 'available',
    isLoading: false,
  }),
}));

type DetailQuery = {
  data?: WorkspaceDetail;
  error?: Error | null;
  refetch: jest.Mock;
};
let mockDetail: DetailQuery;
const mockUseWorkspaceDetail = jest.fn((..._args: unknown[]) => mockDetail);
let mockPushes: { pushes: Map<string, string>; partial: boolean } | undefined;
const mockSync = {
  mutate: jest.fn(),
  isPending: false,
};
const mockRemove = {
  mutate: jest.fn(),
  reset: jest.fn(),
  isPending: false,
  error: null,
};
jest.mock('../../hooks/useWorkspaceActions', () => ({
  useWorkspaceDetail: (...args: unknown[]) => mockUseWorkspaceDetail(...args),
  useWorkspaceLastPushes: () => ({ data: mockPushes }),
  useWorkspaceActions: () => ({ sync: mockSync, remove: mockRemove }),
}));

function docs(overrides: Partial<WorkspaceDetail['workspace']> = {}) {
  const detail: WorkspaceDetail = {
    workspace: {
      name: 'ws-docs',
      organization: 'lab',
      sources: [
        {
          provider: 'github',
          owner: 'example-org',
          repositories: ['api', 'web'],
        },
      ],
      sync: { schedule: 'nightly' },
      sizing: { minimum: '20Gi' },
      resourceVersion: '7',
      createdAt: '2026-10-01T00:00:00Z',
      lastSync: {
        time: '2026-10-20T10:00:00Z',
        result: 'Succeeded',
        trigger: 'change',
      },
      repositories: 2,
      sessions: 2,
      volumeSize: '20Gi',
      neededSize: '6Gi',
      ...overrides,
    },
    mirrors: [
      {
        provider: 'github',
        repository: 'example-org/web',
        defaultBranch: 'main',
        head: 'fedcba9876543210',
        pushedAt: '2026-10-19T08:00:00Z',
        sizeBytes: 2 * 1024 ** 2,
      },
      {
        provider: 'github',
        repository: 'example-org/api',
        defaultBranch: 'trunk',
        head: '0123456789abcdef',
        pushedAt: '2026-10-18T08:00:00Z',
        sizeBytes: 5 * 1024 ** 2,
      },
    ],
    storage: {
      mirrorsBytes: 7 * 1024 ** 2,
      sessionsBytes: 3 * 1024 ** 2,
      volumeSize: '20Gi',
      neededSize: '6Gi',
    },
    sessionDirectories: [
      {
        session: 'sess-mine',
        name: 'Fix the flaky test',
        creator: 'Me@Example.com',
        lastTurn: '2026-10-20T09:00:00Z',
        sizeBytes: 2 * 1024 ** 2,
        cleanupAfter: '2026-11-03T09:00:00Z',
      },
      {
        session: 'sess-theirs',
        name: 'Bump the chart',
        creator: 'dev@example.com',
        lastTurn: '2026-10-19T09:00:00Z',
        sizeBytes: 1024 ** 2,
        cleanupAfter: '2026-11-02T09:00:00Z',
      },
    ],
  };
  return detail;
}

function renderPage(path = '/customize/workspaces/gazelle/lab/ws-docs') {
  return renderInTestApp(
    <PageHeaderActionsProvider>
      <Routes>
        <Route
          path="/customize/workspaces/:installation/:organization/:name"
          element={<WorkspaceDetailRoute />}
        />
      </Routes>
    </PageHeaderActionsProvider>,
    {
      initialRouteEntries: [path],
      mountedRoutes: {
        '/customize/workspaces': workspacesRouteRef,
        '/sessions': sessionsRouteRef,
      },
    },
  );
}

describe('WorkspaceDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDetail = { data: docs(), error: null, refetch: jest.fn() };
    mockPushes = undefined;
    mockMusterApi = {};
    mockPresence = 'available';
  });

  it('shows the workspace with its sources, sync, storage and actions', async () => {
    await renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'ws-docs' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Organization lab · gazelle · example-org · api, web'),
    ).toBeInTheDocument();
    expect(screen.getByText('A change to the workspace')).toBeInTheDocument();
    expect(screen.getByText(/7.0 MiB of repositories/)).toBeInTheDocument();
    expect(screen.getByText('20 GiB · needs 6 GiB')).toBeInTheDocument();
    expect(screen.getByText('20 GiB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();
    expect(screen.queryByText(/next sync/i)).toBeNull();
  });

  it('lists the repositories with their head commits, marking those pushed since', async () => {
    mockPushes = {
      pushes: new Map([
        ['github\u0000example-org/web', '2026-10-21T07:00:00Z'],
        ['github\u0000example-org/api', '2026-10-18T08:00:00Z'],
      ]),
      partial: false,
    };
    await renderPage();

    const region = screen.getByRole('region', { name: 'Repositories (2)' });
    const rows = within(region).getAllByRole('row').slice(1);
    expect(
      rows.map(row => within(row).getAllByRole('rowheader')[0].textContent),
    ).toEqual(['example-org/api', 'example-org/webpushed since the last sync']);
    expect(within(rows[0]).getByText('0123456')).toBeInTheDocument();
    expect(within(rows[1]).getByText('fedcba9')).toBeInTheDocument();
    expect(
      within(region).getByText(
        '1 pushed to since the last sync; a Session starting now fetches them first.',
      ),
    ).toBeInTheDocument();
  });

  it('lists the Sessions on the workspace with their cleanup dates, and filters to mine', async () => {
    await renderPage();

    const region = screen.getByRole('region', {
      name: 'Sessions on this workspace (2)',
    });
    expect(
      within(region).getByRole('link', { name: 'Fix the flaky test' }),
    ).toHaveAttribute('href', '/sessions/gazelle/sess-mine');
    expect(within(region).getByText('dev@example.com')).toBeInTheDocument();
    expect(within(region).getAllByRole('row')[1]).toHaveTextContent(/2026/);

    await userEvent.click(
      screen.getByRole('button', { name: /Filter by created by/i }),
    );
    const listbox = await screen.findByRole('listbox');
    await userEvent.click(within(listbox).getByRole('option', { name: /Me/ }));
    await userEvent.keyboard('{Escape}');
    expect(within(region).queryByText('Bump the chart')).toBeNull();
    expect(within(region).getByText('Fix the flaky test')).toBeInTheDocument();
  });

  it('shows a failed last sync with the manager’s reason', async () => {
    mockDetail = {
      ...mockDetail,
      data: docs({
        lastSync: {
          time: '2026-10-20T10:00:00Z',
          result: 'Failed',
          trigger: 'retry',
          message: 'owner example-org not reachable: 502 Bad Gateway',
        },
      }),
    };
    await renderPage();

    const region = screen.getByRole('region', { name: 'Sync' });
    expect(within(region).getByText('Failed')).toBeInTheDocument();
    expect(
      within(region).getByText(
        'The mirrors stay as they were: owner example-org not reachable: 502 Bad Gateway',
      ),
    ).toBeInTheDocument();
    expect(
      within(region).getByText('A retry after the failed sync before it'),
    ).toBeInTheDocument();
  });

  it('shows a sync running in place of Sync now', async () => {
    mockDetail = {
      ...mockDetail,
      data: docs({
        activeSync: { job: 'sync-9', startedAt: '2026-10-21T08:00:05Z' },
      }),
    };
    await renderPage();

    expect(screen.getByRole('button', { name: 'Syncing…' })).toBeDisabled();
    expect(screen.getByText(/^Syncing, started/)).toBeInTheDocument();
  });

  it('keeps reading, in a background tab too, until a requested sync shows ended', async () => {
    mockSync.mutate.mockImplementation((_: unknown, options: any) =>
      // The read after the request does not show the sync yet.
      options.onSuccess({
        workspace: 'ws-docs',
        requestedAt: '2026-10-21T08:00:00Z',
      }),
    );
    await renderPage();
    expect(mockUseWorkspaceDetail).toHaveBeenLastCalledWith(
      'gazelle',
      'ws-docs',
      true,
      { followSync: true, awaitingSync: false },
    );

    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));

    expect(mockUseWorkspaceDetail).toHaveBeenLastCalledWith(
      'gazelle',
      'ws-docs',
      true,
      { followSync: true, awaitingSync: true },
    );
    expect(screen.getByRole('button', { name: 'Syncing…' })).toBeDisabled();
    expect(screen.queryByTestId('workspace-sync-ended')).toBeNull();
  });

  it('runs Sync now and reports an unchanged result when the sync ends', async () => {
    mockSync.mutate.mockImplementation((_: unknown, options: any) => {
      // The read after the request finds the sync ended, unchanged.
      mockDetail = {
        ...mockDetail,
        data: docs({
          lastSync: {
            time: '2026-10-21T08:00:30Z',
            result: 'NoChange',
            trigger: 'request',
          },
        }),
      };
      options.onSuccess({
        workspace: 'ws-docs',
        requestedAt: '2026-10-21T08:00:00Z',
      });
    });
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));

    expect(mockSync.mutate).toHaveBeenCalled();
    const ended = await screen.findByTestId('workspace-sync-ended');
    expect(ended).toHaveTextContent('The sync ended: unchanged');
    expect(ended).toHaveTextContent(
      'Nothing had changed, so nothing was fetched.',
    );
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeEnabled();

    // A second request that fails takes the first one's outcome away.
    mockSync.mutate.mockImplementation((_: unknown, options: any) =>
      options.onError(new Error('workspace-manager unreachable')),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(screen.queryByTestId('workspace-sync-ended')).toBeNull();
  });

  it('goes to the workspace’s own address from one naming another Organization', async () => {
    await renderPage('/customize/workspaces/gazelle/other-org/ws-docs');

    expect(
      await screen.findByText(
        'Organization lab · gazelle · example-org · api, web',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/other-org/)).toBeNull();
  });

  it.each([
    [
      'without the muster plugin',
      undefined,
      'available',
      'Workspaces are not available here',
    ],
    [
      'where muster lists no workspace-manager',
      {},
      'missing',
      'Workspaces are not available here',
    ],
    [
      'where muster acts under its shared identity',
      {},
      'sharedIdentity',
      'Workspaces cannot be used on gazelle from this portal',
    ],
  ])(
    'says why there is no workspace %s',
    async (_, musterApi, presence, title) => {
      mockMusterApi = musterApi;
      mockPresence = presence;
      await renderPage();

      expect(screen.getByText(title)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
    },
  );

  it('gives a person outside the Organization a not-a-member page, not the workspace', async () => {
    mockDetail = {
      data: undefined,
      error: new WorkspaceManagerError(
        'not_member',
        'get_workspace: permission denied: viewer@lab.local is not a member of Organization lab',
      ),
      refetch: jest.fn(),
    };
    await renderPage();

    expect(screen.getByText('You are not a member of lab')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync now' })).toBeNull();
    expect(screen.queryByRole('region', { name: /Repositories/ })).toBeNull();
  });
});
