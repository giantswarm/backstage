import { SidebarPinStateProvider } from '@backstage/core-components';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { analyticsApiRef, toastApiRef } from '@backstage/frontend-plugin-api';
import { notificationsApiRef } from '@backstage/plugin-notifications';
import { signalApiRef } from '@backstage/plugin-signals-react';
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
import { DESKTOP_NOTIFICATIONS_STORAGE_KEY } from './hooks/useDesktopNotifications';
import {
  NOTIFICATIONS_SIGNAL_CHANNEL,
  UPSTREAM_NOTIFICATIONS_LIMIT,
} from './hooks/useUpstreamRowSource';
import { fakeInbox } from './testing/fakeInbox';
import { createFakeUpstream } from './testing/fakeUpstream';

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
const analyticsApi = mockApis.analytics.mock();

let upstream = createFakeUpstream();

function Location() {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{`${pathname}${search}`}</div>;
}

async function renderShell({
  path = '/',
  withNotificationsApi = true,
}: { path?: string; withNotificationsApi?: boolean } = {}) {
  return renderInTestApp(
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
      apis: [
        [toastApiRef, { post }],
        [analyticsApiRef, analyticsApi],
        [signalApiRef, upstream.signalApi],
        ...(withNotificationsApi
          ? [[notificationsApiRef, upstream.notificationsApi] as const]
          : []),
      ] as any,
      mountedRoutes: {
        '/': homeRouteRef,
        '/sessions': agentPlatformPlugin.routes.sessions,
        '/profile': agentPlatformPlugin.routes.profile,
      },
    },
  );
}

async function openOverlay() {
  await userEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
  return screen.findByRole('dialog', { name: 'Notifications' });
}

/** The backend stores `notification` and announces it on the channel. */
async function send(notification: Parameters<typeof upstream.put>[0]) {
  await act(async () => {
    upstream.put(notification);
    upstream.signal(NOTIFICATIONS_SIGNAL_CHANNEL, {
      action: 'new_notification',
      notification_id: notification.id,
    });
  });
}

function toastTitles() {
  return (post.mock.calls as unknown as Array<[{ title: string }]>).map(
    ([toast]) => toast.title,
  );
}

/** The tracked actions reported, without the page views. */
function reportedEvents() {
  return analyticsApi.captureEvent.mock.calls
    .map(([event]) => [event.action, event.attributes])
    .filter(([action]) => action !== 'navigate');
}

const now = () => Date.now();

let focused = true;
let hasFocus: jest.SpyInstance;

beforeEach(() => {
  fakeInbox.reset();
  upstream = createFakeUpstream();
  post.mockClear();
  close.mockClear();
  analyticsApi.captureEvent.mockClear();
  window.localStorage.clear();
  window.sessionStorage.clear();
  focused = true;
  hasFocus = jest.spyOn(document, 'hasFocus').mockImplementation(() => focused);
});

afterEach(() => hasFocus.mockRestore());

describe('Notification inbox: rows from the upstream notifications store', () => {
  describe('rows', () => {
    it('lists plain rows with their title, description and age, merged with the session rows newest first', async () => {
      upstream.set([
        {
          id: 'n-old',
          title: 'Template run finished',
          description: 'Create a Go service',
          link: '/create/tasks/abc',
          created: now() - 60 * 60_000,
        },
        {
          id: 'n-new',
          title: 'Repository approval needed',
          created: now() - 60_000,
        },
      ]);
      fakeInbox.setSessions([
        {
          sessionId: 's1',
          title: 'Debug ingress',
          state: 'input-required',
          changedAt: now() - 5 * 60_000,
        },
      ]);
      await renderShell();

      const overlay = await openOverlay();
      await waitFor(() =>
        expect(within(overlay).getAllByRole('listitem')).toHaveLength(3),
      );
      const rows = within(overlay).getAllByRole('listitem');
      expect(rows.map(row => row.textContent)).toEqual([
        expect.stringContaining('Repository approval needed'),
        expect.stringContaining('SRE Agent needs your input'),
        expect.stringContaining('Template run finished'),
      ]);
      expect(rows[2]).toHaveTextContent(
        'Create a Go service · about 1 hour ago',
      );
      expect(
        within(rows[2]).getByRole('link', {
          name: 'Unread: Template run finished',
        }),
      ).toHaveAttribute('href', '/create/tasks/abc');
      // A plain row has no avatar, no state chip and no menu.
      expect(within(rows[2]).queryByTestId('agent-avatar')).toBeNull();
      expect(within(rows[2]).queryByRole('button')).toBeNull();
      expect(upstream.notificationsApi.getNotifications).toHaveBeenCalledWith({
        limit: UPSTREAM_NOTIFICATIONS_LIMIT,
        sort: 'created',
        sortOrder: 'desc',
      });
    });

    it('opens a link out of the portal in a new tab', async () => {
      upstream.set([
        {
          id: 'n1',
          title: 'Pipeline failed',
          link: 'https://ci.example.com/runs/42',
          created: now(),
        },
      ]);
      await renderShell();

      const overlay = await openOverlay();
      const link = await within(overlay).findByRole('link', {
        name: 'Unread: Pipeline failed',
      });
      expect(link).toHaveAttribute('href', 'https://ci.example.com/runs/42');
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('counts unread plain rows in the badge and the document title, and keeps read ones read', async () => {
      upstream.set([
        { id: 'n1', title: 'Template run finished', created: now() - 2000 },
        {
          id: 'n2',
          title: 'Template run failed',
          created: now() - 1000,
          read: true,
        },
      ]);
      fakeInbox.setSessions([
        { sessionId: 's1', state: 'input-required', changedAt: now() },
      ]);
      await renderShell();

      await waitFor(() =>
        expect(document.title).toBe('(2) Sessions · Agent Platform'),
      );
      expect(
        screen.getByRole('button', { name: 'Notifications, 2 unread' }),
      ).toBeInTheDocument();
      const overlay = await openOverlay();
      expect(
        within(overlay).getByRole('link', { name: /^Template run failed/ }),
      ).toBeInTheDocument();
    });

    it('shows the session rows when the store cannot be read', async () => {
      upstream.setFailing(true);
      fakeInbox.setSessions([
        { sessionId: 's1', state: 'input-required', changedAt: now() },
      ]);
      await renderShell();

      const overlay = await openOverlay();
      await waitFor(() =>
        expect(within(overlay).getAllByRole('listitem')).toHaveLength(1),
      );
      expect(within(overlay).getByRole('listitem')).toHaveTextContent(
        'SRE Agent needs your input',
      );
      // Catch-up still runs for the rows that could be read.
      expect(toastTitles()).toEqual(['1 session needs your attention']);
    });

    it('shows only the session rows without the notifications API', async () => {
      fakeInbox.setSessions([
        { sessionId: 's1', state: 'input-required', changedAt: now() },
      ]);
      await renderShell({ withNotificationsApi: false });

      const overlay = await openOverlay();
      expect(within(overlay).getAllByRole('listitem')).toHaveLength(1);
    });
  });

  describe('reading', () => {
    it('opens a plain row and marks it read in the store', async () => {
      upstream.set([
        {
          id: 'n1',
          title: 'Template run finished',
          link: '/create/tasks/abc',
          created: now(),
        },
      ]);
      await renderShell();

      const overlay = await openOverlay();
      await userEvent.click(
        await within(overlay).findByRole('link', {
          name: 'Unread: Template run finished',
        }),
      );
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/create/tasks/abc',
      );
      expect(
        upstream.notificationsApi.updateNotifications,
      ).toHaveBeenCalledWith({ ids: ['n1'], read: true });
      await waitFor(() =>
        expect(document.title).toBe('Sessions · Agent Platform'),
      );
      expect(reportedEvents()).toEqual([
        ['AgentPlatform.notificationOpened', { kind: 'plain' }],
      ]);
    });

    it('marks a plain row read on the page it links to, and not below it', async () => {
      upstream.set([
        {
          id: 'n1',
          title: 'Template run finished',
          link: '/create/tasks/abc',
          created: now(),
        },
      ]);
      await renderShell({ path: '/create/tasks/abc/logs' });
      await waitFor(() =>
        expect(document.title).toBe('(1) Sessions · Agent Platform'),
      );
      expect(
        upstream.notificationsApi.updateNotifications,
      ).not.toHaveBeenCalled();
    });

    it('marks a plain row read once the page it links to is on screen, without reporting it opened', async () => {
      upstream.set([
        {
          id: 'n1',
          title: 'Template run finished',
          link: '/create/tasks/abc?tab=logs',
          created: now(),
        },
      ]);
      await renderShell({ path: '/create/tasks/abc' });
      await waitFor(() =>
        expect(
          upstream.notificationsApi.updateNotifications,
        ).toHaveBeenCalledWith({ ids: ['n1'], read: true }),
      );
      await waitFor(() =>
        expect(document.title).toBe('Sessions · Agent Platform'),
      );
      expect(reportedEvents()).toEqual([]);
    });

    it('marks every unread notification in the store read with "Mark all read", with the session rows', async () => {
      upstream.set([
        { id: 'n1', title: 'Template run finished', created: now() - 2000 },
        { id: 'n2', title: 'Template run failed', created: now() - 1000 },
      ]);
      fakeInbox.setSessions([
        { sessionId: 's1', state: 'input-required', changedAt: now() },
      ]);
      await renderShell();

      const overlay = await openOverlay();
      await userEvent.click(
        await within(overlay).findByRole('button', { name: 'Mark all read' }),
      );
      // Upstream has no "mark all" call: the unread ones are read, then marked.
      expect(upstream.notificationsApi.getNotifications).toHaveBeenCalledWith({
        read: false,
      });
      expect(
        upstream.notificationsApi.updateNotifications,
      ).toHaveBeenCalledWith({ ids: ['n2', 'n1'], read: true });
      expect(fakeInbox.writes.markManySeen).toHaveBeenCalledWith(
        [expect.objectContaining({ sessionId: 's1' })],
        { action: 'markedAllRead' },
      );
      await waitFor(() =>
        expect(document.title).toBe('Sessions · Agent Platform'),
      );
      expect(upstream.isRead('n1') && upstream.isRead('n2')).toBe(true);
    });

    it('reports one "Mark all read" when only plain rows are unread', async () => {
      upstream.set([
        { id: 'n1', title: 'Template run finished', created: now() },
      ]);
      await renderShell();

      const overlay = await openOverlay();
      await userEvent.click(
        await within(overlay).findByRole('button', { name: 'Mark all read' }),
      );
      await waitFor(() =>
        expect(reportedEvents()).toEqual([
          ['AgentPlatform.notificationsMarkedRead', {}],
        ]),
      );
      expect(fakeInbox.writes.markManySeen).not.toHaveBeenCalled();
    });

    it('reads the list again on a signal, on opening the overlay and on focus', async () => {
      await renderShell();
      await waitFor(() =>
        expect(upstream.notificationsApi.getNotifications).toHaveBeenCalled(),
      );
      expect(upstream.signalApi.subscribe).toHaveBeenCalledWith(
        NOTIFICATIONS_SIGNAL_CHANNEL,
        expect.any(Function),
      );

      // Read elsewhere: the backend announces it, and the list is read again.
      upstream.put({ id: 'n1', title: 'First', created: now() });
      await act(async () => {
        upstream.signal(NOTIFICATIONS_SIGNAL_CHANNEL, {
          action: 'notification_read',
          notification_ids: ['x'],
        });
      });
      await waitFor(() =>
        expect(document.title).toBe('(1) Sessions · Agent Platform'),
      );

      // No signal: opening the overlay reads it.
      upstream.put({ id: 'n2', title: 'Second', created: now() });
      const overlay = await openOverlay();
      expect(
        await within(overlay).findByRole('link', { name: 'Unread: Second' }),
      ).toBeInTheDocument();

      // No signal: the window regaining the focus reads it.
      upstream.put({ id: 'n3', title: 'Third', created: now() });
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });
      expect(
        await within(overlay).findByRole('link', { name: 'Unread: Third' }),
      ).toBeInTheDocument();
    });

    it('follows a notification read on another tab or device', async () => {
      upstream.set([
        { id: 'n1', title: 'Template run finished', created: now() },
      ]);
      await renderShell();
      await waitFor(() =>
        expect(document.title).toBe('(1) Sessions · Agent Platform'),
      );

      await act(async () => {
        upstream.put({
          id: 'n1',
          title: 'Template run finished',
          created: now(),
          read: true,
        });
        upstream.signal(NOTIFICATIONS_SIGNAL_CHANNEL, {
          action: 'notification_read',
          notification_ids: ['n1'],
        });
      });
      await waitFor(() =>
        expect(document.title).toBe('Sessions · Agent Platform'),
      );
    });
  });

  describe('interruptions', () => {
    it('counts what was unread at the first read in one summary toast, and toasts nothing per row', async () => {
      upstream.set([
        { id: 'n1', title: 'Template run finished', created: now() - 2000 },
      ]);
      fakeInbox.setSessions([
        { sessionId: 's1', state: 'input-required', changedAt: 1000 },
      ]);
      await renderShell();

      await waitFor(() =>
        expect(toastTitles()).toEqual(['2 notifications need your attention']),
      );
    });

    it('toasts a notification that arrives by signal, with its link', async () => {
      await renderShell();
      await waitFor(() =>
        expect(upstream.notificationsApi.getNotifications).toHaveBeenCalled(),
      );

      await send({
        id: 'n1',
        title: 'Template run failed',
        description: 'Create a Go service',
        link: '/create/tasks/abc',
        severity: 'high',
        created: now(),
      });
      await waitFor(() =>
        expect(post).toHaveBeenCalledWith({
          title: 'Template run failed',
          description: 'Create a Go service',
          status: 'warning',
          links: [{ label: 'Open', href: '/create/tasks/abc' }],
        }),
      );
    });

    it('turns a burst of notifications into one toast opening the overlay', async () => {
      await renderShell();
      await waitFor(() =>
        expect(upstream.notificationsApi.getNotifications).toHaveBeenCalled(),
      );

      await act(async () => {
        for (const id of ['n1', 'n2', 'n3', 'n4', 'n5']) {
          upstream.put({
            id,
            title: `Template run ${id} finished`,
            created: now(),
          });
          upstream.signal(NOTIFICATIONS_SIGNAL_CHANNEL, {
            action: 'new_notification',
            notification_id: id,
          });
        }
      });
      await waitFor(() =>
        expect(post).toHaveBeenCalledWith({
          title: '5 notifications need your attention',
          status: 'info',
          links: [{ label: 'Open notifications', href: '#notifications' }],
        }),
      );
      expect(post).toHaveBeenCalledTimes(1);
    });

    it('announces a notification sent again for the same scope as new', async () => {
      upstream.set([
        {
          id: 'n1',
          title: 'Template run finished',
          created: now() - 60_000,
          read: true,
        },
      ]);
      await renderShell();
      await waitFor(() =>
        expect(upstream.notificationsApi.getNotifications).toHaveBeenCalled(),
      );
      expect(toastTitles()).toEqual([]);

      await send({
        id: 'n1',
        title: 'Template run finished again',
        created: now() - 60_000,
        updated: now(),
      });
      await waitFor(() =>
        expect(toastTitles()).toEqual(['Template run finished again']),
      );
      await waitFor(() =>
        expect(document.title).toBe('(1) Sessions · Agent Platform'),
      );
    });

    it('closes the toast once the notification is read', async () => {
      await renderShell();
      await waitFor(() =>
        expect(upstream.notificationsApi.getNotifications).toHaveBeenCalled(),
      );
      await send({ id: 'n1', title: 'Template run failed', created: now() });
      await waitFor(() => expect(post).toHaveBeenCalledTimes(1));

      const overlay = await openOverlay();
      await userEvent.click(
        within(overlay).getByRole('link', {
          name: 'Unread: Template run failed',
        }),
      );
      await waitFor(() => expect(close).toHaveBeenCalled());
    });

    it('raises a desktop notification for news while the person works in another window', async () => {
      const original = window.Notification;
      const shown: Array<{ title: string; options: NotificationOptions }> = [];
      class FakeNotification {
        static permission: NotificationPermission = 'granted';
        static requestPermission = jest.fn();
        onclick: (() => void) | null = null;
        constructor(title: string, options: NotificationOptions) {
          shown.push({ title, options });
        }
        close() {}
      }
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: FakeNotification,
      });
      window.localStorage.setItem(DESKTOP_NOTIFICATIONS_STORAGE_KEY, 'on');
      focused = false;
      try {
        upstream.set([{ id: 'old', title: 'Old news', created: 1000 }]);
        await renderShell();
        await waitFor(() =>
          expect(document.title).toBe('(1) Sessions · Agent Platform'),
        );
        // Catch-up raises none.
        expect(shown).toEqual([]);

        const created = now();
        await send({
          id: 'n1',
          title: 'Template run failed',
          description: 'Create a Go service',
          created,
        });
        await waitFor(() =>
          expect(shown).toEqual([
            {
              title: 'Template run failed',
              options: {
                body: 'Create a Go service',
                tag: `notification:n1:${created}`,
                silent: true,
              },
            },
          ]),
        );
      } finally {
        Object.defineProperty(window, 'Notification', {
          configurable: true,
          value: original,
        });
      }
    });
  });
});
