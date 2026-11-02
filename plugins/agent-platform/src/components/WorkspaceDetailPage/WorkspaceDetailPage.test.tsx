import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import {
  WorkspaceManagerError,
  type WorkspaceDetail,
  type WorkspaceProvider,
} from '../../lib/workspaceManager';
import type { AwaitedSync } from '../../lib/workspaceList';
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
  useWorkspaceManagerClient: () => undefined,
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
/** The sync the person started here, as `awaitSync` records it. */
let mockAwaited: AwaitedSync | undefined;
let mockProviders: WorkspaceProvider[] | undefined;
jest.mock('../../hooks/useWorkspaceEditor', () => ({
  useWorkspaceProviders: () => ({ data: mockProviders }),
}));
jest.mock('../../hooks/useWorkspaceActions', () => ({
  useWorkspaceDetail: (...args: unknown[]) => mockUseWorkspaceDetail(...args),
  useWorkspaceLastPushes: () => ({ data: mockPushes }),
  useWorkspaceActions: () => ({ sync: mockSync, remove: mockRemove }),
  useAwaitedSync: () => mockAwaited,
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
        head: 'fedcba9876543210fedcba9876543210fedcba98',
        pushedAt: '2026-10-19T08:00:00Z',
        sizeBytes: 2 * 1024 ** 2,
      },
      {
        provider: 'github',
        repository: 'example-org/api',
        defaultBranch: 'trunk',
        head: '0123456789abcdef0123456789abcdef01234567',
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
          path="/customize/workspaces/:installation/:organization/:name/*"
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
    mockProviders = undefined;
    mockAwaited = undefined;
    mockMusterApi = {};
    mockPresence = 'available';
  });

  it('shows the workspace with its sources, tabs and actions', async () => {
    await renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'ws-docs' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Organization lab · gazelle · example-org · api, web'),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('tab')
        .map(tab => tab.textContent?.replace(/ \(\d+\)$/, '')),
    ).toEqual(['Repositories', 'Sessions', 'Details']);
    expect(screen.getByRole('button', { name: 'Synchronize' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeEnabled();
    expect(screen.queryByText(/next sync/i)).toBeNull();
  });

  it('shows the synchronization status and the storage under Details', async () => {
    await renderPage('/customize/workspaces/gazelle/lab/ws-docs/details');

    const status = screen.getByRole('region', {
      name: 'Synchronization status',
    });
    expect(
      within(status).getByText('A change to the workspace'),
    ).toBeInTheDocument();
    const storage = screen.getByRole('region', { name: 'Disk' });
    expect(within(storage).getByText('Total')).toBeInTheDocument();
    expect(within(storage).getByText('10.0 MiB')).toBeInTheDocument();
    expect(within(storage).getByText('7.0 MiB')).toBeInTheDocument();
    expect(within(storage).getByText('3.0 MiB')).toBeInTheDocument();
    expect(
      within(storage).getByText(
        '20 GiB · needs 6 GiB · grows when more is needed, never shrinks',
      ),
    ).toBeInTheDocument();
    expect(within(storage).getByText('20 GiB')).toBeInTheDocument();
  });

  it('says an elastic volume has no fixed size', async () => {
    const detail = docs({ volumeSize: undefined, neededSize: undefined });
    detail.storage = {
      ...detail.storage,
      volumeSize: undefined,
      neededSize: undefined,
    };
    mockDetail = { ...mockDetail, data: detail };
    await renderPage('/customize/workspaces/gazelle/lab/ws-docs/details');

    expect(
      screen.getByText(
        'The storage class grows the volume as it fills, so it has no fixed size.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Headroom')).toBeNull();
  });

  it('lists the repositories with their head commits, marking those pushed after the last synchronization', async () => {
    mockPushes = {
      pushes: new Map([
        ['github\u0000example-org/web', '2026-10-21T07:00:00Z'],
        ['github\u0000example-org/api', '2026-10-18T08:00:00Z'],
      ]),
      partial: false,
    };
    await renderPage();

    const rows = within(screen.getByRole('grid')).getAllByRole('row').slice(1);
    expect(
      rows.map(row => within(row).getAllByRole('rowheader')[0].textContent),
    ).toEqual(['example-org/api', 'example-org/web']);
    expect(within(rows[0]).getByText('0123456')).toBeInTheDocument();
    expect(within(rows[1]).getByText('fedcba9')).toBeInTheDocument();
    expect(
      within(rows[0]).queryByText('after last synchronization'),
    ).toBeNull();
    expect(
      within(rows[1]).getByText('after last synchronization'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '1 pushed to after the last synchronization; a session starting now fetches them first.',
      ),
    ).toBeInTheDocument();
  });

  it('links each repository at its provider’s host', async () => {
    mockProviders = [
      { name: 'github', kind: 'github', connected: true, host: 'github.com' },
    ];
    await renderPage();

    expect(
      screen.getByRole('link', { name: 'example-org/api' }),
    ).toHaveAttribute('href', 'https://github.com/example-org/api');
  });

  it('lists the Sessions on the workspace with their cleanup dates, and filters to mine', async () => {
    await renderPage('/customize/workspaces/gazelle/lab/ws-docs/sessions');

    const table = screen.getByRole('grid');
    expect(
      within(table).getByRole('link', { name: 'Fix the flaky test' }),
    ).toHaveAttribute('href', '/sessions/gazelle/sess-mine');
    expect(within(table).getByText('dev@example.com')).toBeInTheDocument();
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent(/2026/);

    await userEvent.click(
      screen.getByRole('button', { name: /Filter by created by/i }),
    );
    const listbox = await screen.findByRole('listbox');
    await userEvent.click(within(listbox).getByRole('option', { name: /Me/ }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('Bump the chart')).toBeNull();
    expect(screen.getByText('Fix the flaky test')).toBeInTheDocument();
  });

  it('shows a failed last synchronization with the manager’s reason', async () => {
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
    await renderPage('/customize/workspaces/gazelle/lab/ws-docs/details');

    const region = screen.getByRole('region', {
      name: 'Synchronization status',
    });
    expect(within(region).getByText('Failed')).toBeInTheDocument();
    expect(
      within(region).getByText(
        'The mirrors stay as they were: owner example-org not reachable: 502 Bad Gateway',
      ),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(
        'A retry after the failed synchronization before it',
      ),
    ).toBeInTheDocument();
  });

  it('shows a synchronization running in place of Synchronize', async () => {
    mockDetail = {
      ...mockDetail,
      data: docs({
        activeSync: { job: 'sync-9', startedAt: '2026-10-21T08:00:05Z' },
      }),
    };
    await renderPage('/customize/workspaces/gazelle/lab/ws-docs/details');

    expect(
      screen.getByRole('button', { name: 'Synchronizing…' }),
    ).toBeDisabled();
    expect(screen.getByText(/^Synchronizing, started/)).toBeInTheDocument();
  });

  it('says Synchronizing on the badge and the button from the click on, until a read shows the synchronization ended', async () => {
    mockSync.mutate.mockImplementation((variables: unknown, options: any) => {
      // The request is recorded as it is made; the read after it does not
      // show the synchronization yet.
      mockAwaited = {
        cause: 'requested',
        ...(variables as { after: string }),
        since: Date.now(),
      };
      options.onSuccess({
        workspace: 'ws-docs',
        requestedAt: '2026-10-21T08:00:00Z',
      });
    });
    await renderPage();
    expect(screen.getByText('Synchronized')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Synchronize' }));

    expect(mockSync.mutate).toHaveBeenCalledWith(
      { after: '2026-10-20T10:00:00Z' },
      expect.anything(),
    );
    expect(screen.getByText('Synchronizing')).toBeInTheDocument();
    expect(screen.queryByText('Synchronized')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Synchronizing…' }),
    ).toBeDisabled();
    expect(
      screen.queryByText('Workspace synchronization successful'),
    ).toBeNull();
  });

  it('says Synchronizing on the badge and in Details for a new workspace the manager has not taken up yet, and leaves Synchronize to the person', async () => {
    mockDetail = {
      ...mockDetail,
      data: {
        ...docs({
          createdAt: new Date().toISOString(),
          lastSync: undefined,
        }),
        mirrors: [],
      },
    };
    await renderPage('/customize/workspaces/gazelle/lab/ws-docs/details');

    expect(screen.getByText('Synchronizing')).toBeInTheDocument();
    // The manager reports no sync: should it not start one, the person can.
    expect(screen.getByRole('button', { name: 'Synchronize' })).toBeEnabled();
    const status = screen.getByRole('region', {
      name: 'Synchronization status',
    });
    expect(
      within(status).getByText(
        'Synchronizing, waiting for the workspace-manager to start it',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not synchronized yet/i)).toBeNull();
  });

  it('words a requested synchronization as the badge and the button do', async () => {
    mockDetail = {
      ...mockDetail,
      data: docs({
        syncRequest: {
          requestedAt: '2026-10-21T08:00:00Z',
          requestedBy: 'dev@example.com',
        },
      }),
    };
    await renderPage('/customize/workspaces/gazelle/lab/ws-docs/details');

    expect(screen.getByText('Synchronizing')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Synchronizing…' }),
    ).toBeDisabled();
    const status = screen.getByRole('region', {
      name: 'Synchronization status',
    });
    expect(
      within(status).getByText(/^Synchronizing, requested/),
    ).toHaveTextContent(/by dev@example\.com, waiting to start$/);
  });

  it('runs Synchronize and notifies an unchanged result when it ends', async () => {
    mockSync.mutate.mockImplementation((variables: unknown, options: any) => {
      mockAwaited = {
        cause: 'requested',
        ...(variables as { after: string }),
        since: Date.now(),
      };
      // The read after the request finds the synchronization ended, unchanged.
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

    await userEvent.click(screen.getByRole('button', { name: 'Synchronize' }));

    expect(mockSync.mutate).toHaveBeenCalled();
    expect(
      await screen.findByText('Workspace synchronization successful'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Nothing had changed, so nothing was fetched.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Synchronize' })).toBeEnabled();
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
      expect(screen.queryByRole('button', { name: 'Synchronize' })).toBeNull();
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
    expect(screen.queryByRole('button', { name: 'Synchronize' })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Repositories/ })).toBeNull();
  });
});
