import { SidebarPinStateProvider } from '@backstage/core-components';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { toastApiRef } from '@backstage/frontend-plugin-api';
import {
  ShellDocumentTitle,
  ShellDocumentTitleProvider,
} from '@giantswarm/backstage-plugin-ui-react';
import { agentPlatformPlugin } from '@giantswarm/backstage-plugin-agent-platform';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { AgentShellNav } from '../AgentShellNav';
import { RailWidthProvider } from '../RailWidthProvider';
import { homeRouteRef } from '../routes';
import { DESKTOP_NOTIFICATIONS_STORAGE_KEY } from './desktopNotifications';
import { fakeInbox, type FakeSession } from './testing/fakeInbox';
import { TOAST_BURST } from './useInboxInterruptions';

jest.mock('@giantswarm/backstage-plugin-agent-platform', () => {
  const { createRouteRef, createSubRouteRef } = jest.requireActual(
    '@backstage/frontend-plugin-api',
  );
  const { fakeInboxPluginExports } = jest.requireActual('./testing/fakeInbox');
  const sessions = createRouteRef();
  return {
    ...fakeInboxPluginExports(),
    agentPlatformPlugin: {
      routes: {
        sessions,
        sessionDetail: createSubRouteRef({
          path: '/:installation/:sessionId',
          parent: sessions,
        }),
        usage: createRouteRef(),
        agents: createRouteRef(),
        skills: createRouteRef(),
        models: createRouteRef(),
        profile: createRouteRef(),
      },
    },
    RecentSessions: () => null,
  };
});

jest.mock('@giantswarm/backstage-plugin-muster', () => {
  const { createRouteRef } = jest.requireActual(
    '@backstage/frontend-plugin-api',
  );
  return {
    __esModule: true,
    default: {
      routes: { mcpServers: createRouteRef(), workflows: createRouteRef() },
    },
  };
});

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ClusterAccessConnector: () => null,
}));

const close = jest.fn();
const post = jest.fn(() => ({ close }));

const SESSION_PATH = '/agent-platform/sessions/gazelle';

function Location() {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{`${pathname}${search}`}</div>;
}

async function renderShell({ path = '/' }: { path?: string } = {}) {
  await renderInTestApp(
    <ShellDocumentTitleProvider suffix="Agent Platform">
      <RailWidthProvider>
        <SidebarPinStateProvider
          value={{
            isPinned: true,
            toggleSidebarPinState: () => {},
            isMobile: false,
          }}
        >
          <AgentShellNav />
        </SidebarPinStateProvider>
      </RailWidthProvider>
      <ShellDocumentTitle title="Sessions" />
      <Location />
    </ShellDocumentTitleProvider>,
    {
      initialRouteEntries: [path],
      apis: [[toastApiRef, { post }]],
      mountedRoutes: {
        '/': homeRouteRef,
        '/agent-platform/sessions': agentPlatformPlugin.routes.sessions,
        '/agent-platform/profile': agentPlatformPlugin.routes.profile,
      },
    },
  );
}

/** The next session-states read answers with `sessions`. */
async function read(sessions: FakeSession[]) {
  await act(async () => {
    fakeInbox.setSessions(sessions);
  });
}

async function openOverlay() {
  await userEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
  return screen.findByRole('dialog', { name: 'Notifications' });
}

function toastTitles() {
  return (post.mock.calls as unknown as Array<[{ title: string }]>).map(
    ([toast]) => toast.title,
  );
}

const now = () => Date.now();

beforeEach(() => {
  fakeInbox.reset();
  post.mockClear();
  close.mockClear();
  window.localStorage.clear();
});

describe('Notification inbox', () => {
  describe('rows', () => {
    it('lists a row per session that needs the person, newest first, with what happened and a state chip', async () => {
      fakeInbox.setSessions([
        {
          sessionId: 'old',
          title: 'Upgrade checklist',
          agentName: 'Kube Assistant',
          state: 'failed',
          failureReason: 'model-unavailable',
          portalStarted: true,
          changedAt: now() - 14 * 60_000,
        },
        {
          sessionId: 'new',
          title: 'Debug ingress',
          state: 'input-required',
          changedAt: now() - 2 * 60_000,
        },
        {
          sessionId: 'done',
          title: 'Release notes draft',
          agentName: 'Docs Writer',
          state: 'completed',
          portalStarted: true,
          level: 'all',
          changedAt: now() - 60 * 60_000,
        },
      ]);
      await renderShell();

      const overlay = await openOverlay();
      const rows = within(overlay).getAllByRole('listitem');
      expect(rows.map(row => row.textContent)).toEqual([
        expect.stringContaining('SRE Agent needs your input'),
        expect.stringContaining('Kube Assistant: turn failed'),
        expect.stringContaining('Docs Writer finished its turn'),
      ]);
      expect(rows[0]).toHaveTextContent('Debug ingress · 2 minutes ago');
      expect(rows[0]).toHaveTextContent('Waiting');
      expect(rows[1]).toHaveTextContent(
        'Upgrade checklist · 14 minutes ago · model unavailable',
      );
      expect(rows[1]).toHaveTextContent('Failed');
      expect(rows[2]).toHaveTextContent('Finished');
      expect(within(rows[0]).getByTestId('agent-avatar')).toHaveTextContent(
        'SRE Agent',
      );
      expect(
        within(rows[0]).getByRole('link', {
          name: 'Unread: SRE Agent needs your input',
        }),
      ).toHaveAttribute('href', `${SESSION_PATH}/new`);
    });

    it('follows the row rule: Waiting for any session, Failed and finished turns only for portal-started ones at their level', async () => {
      fakeInbox.setSessions([
        { sessionId: 'slack-waits', state: 'input-required', agentName: 'A' },
        { sessionId: 'slack-failed', state: 'failed', agentName: 'B' },
        {
          sessionId: 'finished-default',
          state: 'completed',
          portalStarted: true,
          agentName: 'C',
        },
        {
          sessionId: 'muted',
          state: 'input-required',
          level: 'muted',
          agentName: 'D',
        },
        { sessionId: 'canceled', state: 'canceled', portalStarted: true },
        { sessionId: 'working', state: 'working' },
      ]);
      await renderShell();

      const overlay = await openOverlay();
      expect(
        within(overlay)
          .getAllByRole('listitem')
          .map(row => within(row).getAllByRole('link')[0].textContent),
      ).toEqual([expect.stringContaining('A needs your input')]);
    });

    it('says when nothing needs the person', async () => {
      await renderShell();

      const overlay = await openOverlay();
      expect(
        within(overlay).getByText('Nothing needs you right now.'),
      ).toBeInTheDocument();
      expect(
        within(overlay).queryByRole('button', { name: 'Mark all read' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('reading', () => {
    const waiting: FakeSession[] = [
      { sessionId: 's1', title: 'Debug ingress', state: 'input-required' },
      { sessionId: 's2', title: 'Deploy check', state: 'input-required' },
    ];

    it('opens the session from its row and marks the row read, which another read keeps', async () => {
      fakeInbox.setSessions(waiting);
      await renderShell();

      const overlay = await openOverlay();
      await userEvent.click(
        within(overlay).getAllByRole('link', {
          name: 'Unread: SRE Agent needs your input',
        })[0],
      );
      expect(screen.getByTestId('location')).toHaveTextContent(
        `${SESSION_PATH}/s1`,
      );
      expect(fakeInbox.writes.markSeen).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'session', sessionId: 's1' }),
      );
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Notifications, 1 unread' }),
        ).toBeInTheDocument(),
      );

      // The overlay closed; the same state read again is the same, read row.
      await read(waiting);
      expect(
        screen.getByRole('button', { name: 'Notifications, 1 unread' }),
      ).toBeInTheDocument();
    });

    it('marks the row of the session on screen read', async () => {
      fakeInbox.setSessions(waiting);
      await renderShell({ path: `${SESSION_PATH}/s2` });

      await waitFor(() =>
        expect(fakeInbox.writes.markSeen).toHaveBeenCalledWith(
          expect.objectContaining({ sessionId: 's2' }),
        ),
      );
      expect(
        screen.getByRole('button', { name: 'Notifications, 1 unread' }),
      ).toBeInTheDocument();
    });

    it('makes a session that waits again unread again', async () => {
      fakeInbox.setSessions([
        { sessionId: 's1', state: 'input-required', changedAt: 1000 },
      ]);
      await renderShell();
      const overlay = await openOverlay();
      await userEvent.click(
        within(overlay).getByRole('button', { name: 'Mark all read' }),
      );
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Notifications', hidden: true }),
        ).toBeInTheDocument(),
      );

      await read([
        { sessionId: 's1', state: 'input-required', changedAt: 2000 },
      ]);
      expect(
        screen.getByRole('button', {
          name: 'Notifications, 1 unread',
          hidden: true,
        }),
      ).toBeInTheDocument();
    });

    it('marks every row read with "Mark all read", in one write', async () => {
      fakeInbox.setSessions(waiting);
      await renderShell();

      const overlay = await openOverlay();
      await userEvent.click(
        within(overlay).getByRole('button', { name: 'Mark all read' }),
      );
      expect(fakeInbox.writes.markManySeen).toHaveBeenCalledTimes(1);
      expect(fakeInbox.writes.markManySeen).toHaveBeenCalledWith([
        expect.objectContaining({ sessionId: 's1' }),
        expect.objectContaining({ sessionId: 's2' }),
      ]);
      await waitFor(() =>
        expect(
          within(overlay).queryByRole('button', { name: 'Mark all read' }),
        ).not.toBeInTheDocument(),
      );
      expect(within(overlay).getAllByRole('listitem')).toHaveLength(2);
    });

    it('mutes a session from its row', async () => {
      fakeInbox.setSessions(waiting);
      await renderShell();

      const overlay = await openOverlay();
      await userEvent.click(
        within(overlay).getAllByRole('button', {
          name: 'More actions for SRE Agent needs your input',
        })[0],
      );
      await userEvent.click(
        await screen.findByRole('menuitem', { name: 'Mute this session' }),
      );
      expect(fakeInbox.writes.setLevel).toHaveBeenCalledWith(
        'gazelle',
        expect.any(String),
        'muted',
      );
      await waitFor(() =>
        expect(within(overlay).getAllByRole('listitem')).toHaveLength(1),
      );
    });

    it('prefixes the document title with the unread count', async () => {
      fakeInbox.setSessions(waiting);
      await renderShell();

      await waitFor(() =>
        expect(document.title).toBe('(2) Sessions · Agent Platform'),
      );
      await act(async () => {
        await fakeInbox.writes.markManySeen([
          {
            kind: 'session',
            installation: 'gazelle',
            sessionId: 's1',
            mark: 'gazelle:s1:waiting:',
          },
        ]);
      });
      await act(async () => {
        fakeInbox.setSessions([]);
      });
      await waitFor(() =>
        expect(document.title).toBe('Sessions · Agent Platform'),
      );
    });
  });

  describe('interruptions', () => {
    it('raises one summary toast for what was unread at the first read, and no toast per row', async () => {
      fakeInbox.setSessions([
        { sessionId: 's1', state: 'input-required', changedAt: 1000 },
        {
          sessionId: 's2',
          state: 'failed',
          portalStarted: true,
          changedAt: 2000,
        },
      ]);
      await renderShell();

      await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '2 sessions need your attention',
          links: [{ label: 'Open notifications', href: '/#notifications' }],
        }),
      );

      // The same rows read again are still not news.
      await read([
        { sessionId: 's1', state: 'input-required', changedAt: 1000 },
        {
          sessionId: 's2',
          state: 'failed',
          portalStarted: true,
          changedAt: 2000,
        },
      ]);
      expect(post).toHaveBeenCalledTimes(1);
    });

    it('opens the overlay from the summary toast and closes the toast', async () => {
      fakeInbox.setSessions([
        { sessionId: 's1', state: 'input-required', changedAt: 1000 },
      ]);
      await renderShell({ path: '/#notifications' });

      expect(
        await screen.findByRole('dialog', { name: 'Notifications' }),
      ).toBeInTheDocument();
      await waitFor(() => expect(close).toHaveBeenCalled());
    });

    it('raises no summary toast when nothing is unread', async () => {
      await renderShell();
      await read([{ sessionId: 's1', state: 'working' }]);
      expect(post).not.toHaveBeenCalled();
    });

    it('toasts a session that starts waiting after the first read, with a link to it', async () => {
      fakeInbox.setSessions([{ sessionId: 's1', state: 'working' }]);
      await renderShell();

      await read([
        {
          sessionId: 's1',
          title: 'Debug ingress',
          state: 'input-required',
          changedAt: now(),
        },
      ]);
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith({
        title: 'SRE Agent is waiting for you',
        description: 'Debug ingress',
        status: 'warning',
        links: [{ label: 'Open session', href: `${SESSION_PATH}/s1` }],
      });

      // Answered from anywhere: the row goes, and its toast with it.
      await read([{ sessionId: 's1', state: 'working', changedAt: now() }]);
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('closes a toast once its session is opened', async () => {
      fakeInbox.setSessions([{ sessionId: 's1', state: 'working' }]);
      await renderShell();
      await read([
        { sessionId: 's1', state: 'input-required', changedAt: now() },
      ]);
      expect(post).toHaveBeenCalledTimes(1);

      const overlay = await openOverlay();
      await userEvent.click(within(overlay).getAllByRole('link')[0]);
      await waitFor(() => expect(close).toHaveBeenCalled());
    });

    it('raises nothing for the session on screen', async () => {
      fakeInbox.setSessions([{ sessionId: 's1', state: 'working' }]);
      await renderShell({ path: `${SESSION_PATH}/s1` });

      await read([
        { sessionId: 's1', state: 'input-required', changedAt: now() },
      ]);
      expect(post).not.toHaveBeenCalled();
    });

    it(`turns more than ${TOAST_BURST} sessions that start waiting at once into one toast opening the waiting sessions`, async () => {
      const ids = ['s1', 's2', 's3', 's4'];
      fakeInbox.setSessions(
        ids.map(sessionId => ({ sessionId, state: 'working' })),
      );
      await renderShell();

      await read(
        ids.map(sessionId => ({
          sessionId,
          state: 'input-required',
          changedAt: now(),
        })),
      );
      expect(toastTitles()).toEqual(['4 sessions need your input']);
      expect(post).toHaveBeenCalledWith(
        expect.objectContaining({
          links: [
            {
              label: 'Show waiting sessions',
              href: '/agent-platform/sessions?state=waiting',
            },
          ],
        }),
      );
    });

    it('does not announce a row the person has already seen elsewhere', async () => {
      fakeInbox.setSessions([{ sessionId: 's1', state: 'working' }]);
      await renderShell();
      const changedAt = now();
      fakeInbox.seeElsewhere({
        kind: 'session',
        installation: 'gazelle',
        sessionId: 's1',
        mark: `gazelle:s1:waiting:${changedAt}`,
      });

      await read([{ sessionId: 's1', state: 'input-required', changedAt }]);
      expect(post).not.toHaveBeenCalled();
    });
  });

  describe('desktop notifications', () => {
    let requestPermission: jest.Mock;
    let shown: Array<{ title: string; options: NotificationOptions }>;
    let hasFocus: jest.SpyInstance;
    const original = window.Notification;

    function installNotification(permission: NotificationPermission) {
      shown = [];
      class FakeNotification {
        static permission: NotificationPermission = permission;
        static requestPermission: jest.Mock;
        onclick: (() => void) | null = null;
        constructor(title: string, options: NotificationOptions) {
          shown.push({ title, options });
        }
        close() {}
      }
      requestPermission = jest.fn(async () => {
        FakeNotification.permission = 'granted';
        return 'granted' as NotificationPermission;
      });
      FakeNotification.requestPermission = requestPermission;
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: FakeNotification,
      });
    }

    beforeEach(() => {
      hasFocus = jest.spyOn(document, 'hasFocus').mockReturnValue(false);
    });

    afterEach(() => {
      hasFocus.mockRestore();
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: original,
      });
    });

    it('asks the browser for permission only when the switch is clicked', async () => {
      installNotification('default');
      await renderShell();

      const overlay = await openOverlay();
      expect(requestPermission).not.toHaveBeenCalled();
      const control = within(overlay).getByRole('switch', {
        name: 'Desktop notifications',
      });
      expect(control).not.toBeChecked();

      await userEvent.click(control);
      expect(requestPermission).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(control).toBeChecked());
      expect(
        window.localStorage.getItem(DESKTOP_NOTIFICATIONS_STORAGE_KEY),
      ).toBe('on');
    });

    it('says the browser blocks them when it does', async () => {
      installNotification('denied');
      await renderShell();

      const overlay = await openOverlay();
      expect(
        within(overlay).getByRole('switch', { name: 'Desktop notifications' }),
      ).toBeDisabled();
      expect(
        within(overlay).getByText(/This browser blocks notifications/),
      ).toBeInTheDocument();
    });

    it('raises news silently, tagged with the row, naming only the agent, the session and the event', async () => {
      installNotification('granted');
      window.localStorage.setItem(DESKTOP_NOTIFICATIONS_STORAGE_KEY, 'on');
      fakeInbox.setSessions([
        { sessionId: 'old', state: 'input-required', changedAt: 1000 },
        { sessionId: 's1', state: 'working' },
      ]);
      await renderShell();
      // Catch-up raises none.
      expect(shown).toEqual([]);

      const changedAt = now();
      await read([
        { sessionId: 'old', state: 'input-required', changedAt: 1000 },
        {
          sessionId: 's1',
          title: 'Debug ingress',
          state: 'input-required',
          changedAt,
        },
      ]);
      expect(shown).toEqual([
        {
          title: 'SRE Agent is waiting for you',
          options: {
            body: 'Debug ingress',
            tag: `gazelle:s1:waiting:${changedAt}`,
            silent: true,
          },
        },
      ]);
    });

    it('raises none while switched off', async () => {
      installNotification('granted');
      fakeInbox.setSessions([{ sessionId: 's1', state: 'working' }]);
      await renderShell();

      await read([
        { sessionId: 's1', state: 'input-required', changedAt: now() },
      ]);
      expect(shown).toEqual([]);
    });
  });
});
