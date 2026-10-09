import type { ReactNode } from 'react';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { StorageApi, storageApiRef } from '@backstage/core-plugin-api';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KagentSession } from '@giantswarm/backstage-plugin-agent-platform-common';
import { kagentApiRef } from '../../apis';
import { KagentApi } from '../../apis/types';
import { sessionsRouteRef } from '../../routes';
import { SessionNotificationsBell } from './SessionNotificationsBell';

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  applyInstallationScope: (installations: string[]) => installations,
  useInstallations: () => ({
    installations: [{ name: 'gazelle' }],
    isLoading: false,
  }),
  useInstallationInventory: () => ({
    entries: [],
    isLoading: false,
    isProbing: false,
    installationsWith: (component: string) =>
      component === 'kagent' ? ['gazelle'] : [],
    refresh: () => {},
  }),
  useInstallationScope: () => ({
    scope: 'all',
    setScope: () => {},
    installations: [],
    isSingleInstallation: false,
    isLoading: false,
  }),
}));

let mockQueryClient: QueryClient;

jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={mockQueryClient}>
      {children}
    </QueryClientProvider>
  ),
}));

jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('../AgentsDataProvider', () => ({
  AgentsDataProvider: ({ children }: { children: ReactNode }) => children,
  useAgents: () => ({ rows: [] }),
}));

jest.mock('../../hooks/useKagentCapabilities', () => ({
  useKagentCapabilitiesMap: () => () => ({}),
}));

const listSessions = jest.fn();
const listSessionStates = jest.fn();
const listInstallations = jest
  .fn()
  .mockResolvedValue([{ name: 'gazelle', reachable: true }]);

const kagentApi = {
  listSessions,
  listSessionStates,
  listInstallations,
  getIdentity: jest.fn(),
} as unknown as KagentApi;

function session(id: string, createdAt: string, title: string): KagentSession {
  return {
    id: `gazelle/${id}`,
    sessionId: id,
    installation: 'gazelle',
    title,
    agentId: 'agent_platform__NS__pr_reviewer',
    createdAt,
    updatedAt: createdAt,
  } as KagentSession;
}

const WAIT_STARTED = Date.now() - 60_000;

function renderBell(options: { mounted?: boolean; storage?: StorageApi } = {}) {
  const { mounted = true, storage = mockApis.storage() } = options;
  return renderInTestApp(<SessionNotificationsBell />, {
    apis: [
      [kagentApiRef, kagentApi],
      [storageApiRef, storage],
    ],
    ...(mounted && {
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    }),
  });
}

beforeEach(() => {
  mockQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  listSessions.mockReset();
  listSessionStates.mockReset();
  listInstallations.mockClear();
  listSessions.mockResolvedValue([
    session('waiting', '2026-10-08T10:00:00Z', 'Summarise the tickets'),
    session('busy', '2026-10-09T10:00:00Z', 'Write release notes'),
    session('done', '2026-10-01T10:00:00Z', 'Old research'),
  ]);
  listSessionStates.mockResolvedValue({
    evaluatedAt: 0,
    states: [
      {
        sessionId: 'waiting',
        state: 'input-required',
        changedAt: WAIT_STARTED,
      },
      { sessionId: 'busy', state: 'working' },
      { sessionId: 'done', state: 'completed' },
    ],
    unreadable: [],
    skipped: 0,
  });
});

/**
 * The bell's trigger while the panel is open: the open panel hides everything
 * else from the accessibility tree, so the role queries cannot reach it.
 */
function closedBellTrigger() {
  const trigger = document.querySelector<HTMLButtonElement>(
    'button[aria-haspopup="dialog"][aria-expanded="true"]',
  );
  if (!trigger) {
    throw new Error('No open bell trigger found');
  }
  return trigger;
}

/** The stored notification settings, as the hook writes them. */
function storedSettings(storage: StorageApi) {
  return storage.forBucket('agent-platform').snapshot('sessionNotifications')
    .value;
}

describe('SessionNotificationsBell', () => {
  it('counts the sessions waiting for input on the badge', async () => {
    await renderBell();

    expect(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    ).toBeInTheDocument();
  });

  it('lists the waiting sessions in the panel, each linking to its session', async () => {
    const user = userEvent.setup();
    await renderBell();

    await user.click(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Notifications',
    });
    const link = within(dialog).getByRole('link', {
      name: /Summarise the tickets/,
    });
    expect(link).toHaveAttribute(
      'href',
      '/agent-platform/sessions/gazelle/waiting',
    );
    expect(
      within(dialog).getByText(/Waiting for your input/),
    ).toBeInTheDocument();
    // Only the waiting session is listed.
    expect(
      within(dialog).queryByText('Write release notes'),
    ).not.toBeInTheDocument();
  });

  it('says so when nothing needs the person', async () => {
    const user = userEvent.setup();
    listSessionStates.mockResolvedValue({
      evaluatedAt: 0,
      states: [{ sessionId: 'busy', state: 'working' }],
      unreadable: [],
      skipped: 0,
    });
    await renderBell();

    const bell = await screen.findByRole('button', { name: 'Notifications' });
    await user.click(bell);

    const dialog = await screen.findByRole('dialog', {
      name: 'Notifications',
    });
    expect(
      within(dialog).getByText('Nothing needs you right now'),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('button', { name: 'Mark all read' }),
    ).not.toBeInTheDocument();
  });

  it('marks everything read, clearing the badge until the state moves again', async () => {
    const user = userEvent.setup();
    const storage = mockApis.storage();
    await renderBell({ storage });

    await user.click(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    );
    await user.click(
      await screen.findByRole('button', { name: 'Mark all read' }),
    );

    await waitFor(() =>
      expect(storedSettings(storage)).toEqual([
        {
          installation: 'gazelle',
          sessionId: 'waiting',
          readAt: WAIT_STARTED,
        },
      ]),
    );
    // The row stays listed — read, not gone: the session still waits — and
    // with nothing unread the header offers no Mark all read.
    const dialog = screen.getByRole('dialog', { name: 'Notifications' });
    expect(
      within(dialog).getByText('Summarise the tickets'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(dialog).queryByRole('button', { name: 'Mark all read' }),
      ).not.toBeInTheDocument(),
    );

    // The badge is gone once the panel closes (the open panel hides the rest
    // of the page from the accessibility tree, so the trigger is reached by
    // its label).
    await user.click(closedBellTrigger());
    expect(
      await screen.findByRole('button', { name: 'Notifications' }),
    ).toBeInTheDocument();
  });

  it('mutes a session from its row menu, keeping it listed but uncounted', async () => {
    const user = userEvent.setup();
    const storage = mockApis.storage();
    await renderBell({ storage });

    await user.click(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    );
    await user.click(
      await screen.findByRole('button', {
        name: 'More actions for “Summarise the tickets”',
      }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: 'Mute this session' }),
    );

    await waitFor(() =>
      expect(storedSettings(storage)).toEqual([
        { installation: 'gazelle', sessionId: 'waiting', muted: true },
      ]),
    );
    const dialog = screen.getByRole('dialog', { name: 'Notifications' });
    expect(
      within(dialog).getByText('Summarise the tickets'),
    ).toBeInTheDocument();
    expect(await within(dialog).findByText('Muted')).toBeInTheDocument();

    // The same menu now unmutes.
    await user.click(
      screen.getByRole('button', {
        name: 'More actions for “Summarise the tickets”',
      }),
    );
    expect(
      await screen.findByRole('menuitem', { name: 'Unmute this session' }),
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');

    // Uncounted: with the panel closed, the badge is gone.
    await user.click(closedBellTrigger());
    expect(
      await screen.findByRole('button', { name: 'Notifications' }),
    ).toBeInTheDocument();
  });

  it('marks one session read and unread from its row menu', async () => {
    const user = userEvent.setup();
    const storage = mockApis.storage();
    await renderBell({ storage });

    await user.click(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    );
    await user.click(
      await screen.findByRole('button', {
        name: 'More actions for “Summarise the tickets”',
      }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: 'Mark as read' }),
    );

    // With nothing unread the header offers no Mark all read — the in-panel
    // mirror of the badge, which the open panel hides from the a11y tree.
    const dialog = screen.getByRole('dialog', { name: 'Notifications' });
    await waitFor(() =>
      expect(
        within(dialog).queryByRole('button', { name: 'Mark all read' }),
      ).not.toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole('button', {
        name: 'More actions for “Summarise the tickets”',
      }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: 'Mark as unread' }),
    );
    expect(
      await within(dialog).findByRole('button', { name: 'Mark all read' }),
    ).toBeInTheDocument();

    await user.click(closedBellTrigger());
    expect(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    ).toBeInTheDocument();
  });

  it('renders nothing and reads nothing when the sessions route is not bound', async () => {
    await renderBell({ mounted: false });

    expect(
      screen.queryByRole('button', { name: /Notifications/ }),
    ).not.toBeInTheDocument();
    expect(listSessions).not.toHaveBeenCalled();
    expect(listSessionStates).not.toHaveBeenCalled();
  });
});
