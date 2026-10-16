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
import { DESKTOP_NOTIFICATIONS_STORAGE_KEY } from './hooks/useDesktopNotifications';
import { fakeInbox, type FakeSession } from './testing/fakeInbox';
import { TOAST_BURST } from './hooks/useInboxInterruptions';
import { NARROW_RETRY_MS } from './hooks/useMcpSignInRowSource';

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
  const { fakeInboxMusterExports } = jest.requireActual('./testing/fakeInbox');
  return {
    __esModule: true,
    ...fakeInboxMusterExports(),
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

const SESSION_PATH = '/sessions/gazelle';

function Location() {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{`${pathname}${search}`}</div>;
}

async function renderShell({ path = '/' }: { path?: string } = {}) {
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
      {/* The app's toast region, as upstream renders a toast's links. */}
      <div className="Toast_container__test">
        <a href={`${SESSION_PATH}/s1`}>Open session</a>
        <a href="#notifications">Open notifications</a>
        <a href="#mcp-sign-in">Sign in</a>
      </div>
    </ShellDocumentTitleProvider>,
    {
      initialRouteEntries: [path],
      apis: [[toastApiRef, { post }]],
      mountedRoutes: {
        '/': homeRouteRef,
        '/sessions': agentPlatformPlugin.routes.sessions,
        '/profile': agentPlatformPlugin.routes.profile,
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

// Whether the window has the focus: the person works in it.
let focused = true;
let hasFocus: jest.SpyInstance;

async function setFocused(next: boolean) {
  focused = next;
  await act(async () => {
    window.dispatchEvent(new Event(next ? 'focus' : 'blur'));
  });
}

beforeEach(() => {
  fakeInbox.reset();
  post.mockClear();
  close.mockClear();
  window.localStorage.clear();
  window.sessionStorage.clear();
  focused = true;
  hasFocus = jest.spyOn(document, 'hasFocus').mockImplementation(() => focused);
});

afterEach(() => hasFocus.mockRestore());

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
      // One write, reported as the person opening a waiting row; the page it
      // opened does not write it again.
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Notifications, 1 unread' }),
        ).toBeInTheDocument(),
      );
      expect(fakeInbox.writes.markSeen).toHaveBeenCalledTimes(1);
      expect(fakeInbox.writes.markSeen).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'session', sessionId: 's1' }),
        { action: 'opened', kind: 'waiting' },
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
          undefined,
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
      expect(fakeInbox.writes.markManySeen).toHaveBeenCalledWith(
        [
          expect.objectContaining({ sessionId: 's1' }),
          expect.objectContaining({ sessionId: 's2' }),
        ],
        { action: 'markedAllRead' },
      );
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
          links: [{ label: 'Open notifications', href: '#notifications' }],
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
              href: '/sessions?state=waiting',
            },
          ],
        }),
      );
    });

    it('stays quiet about an old wait an installation reports late, with no time to tell', async () => {
      fakeInbox.setSessions([{ sessionId: 's1', state: 'working' }]);
      await renderShell();

      await read([
        { sessionId: 's1', state: 'working' },
        { sessionId: 'late', installation: 'golem', state: 'input-required' },
      ]);
      expect(post).not.toHaveBeenCalled();
      // Still unread in the bell.
      expect(
        screen.getByRole('button', { name: 'Notifications, 1 unread' }),
      ).toBeInTheDocument();
    });

    it('announces a watched session that starts waiting, whatever the server clock says', async () => {
      fakeInbox.setSessions([{ sessionId: 's1', state: 'working' }]);
      await renderShell();

      // The server's clock runs ten minutes behind the browser's.
      await read([
        {
          sessionId: 's1',
          state: 'input-required',
          changedAt: now() - 10 * 60_000,
        },
      ]);
      expect(toastTitles()).toEqual(['SRE Agent is waiting for you']);
    });

    it('does not catch up again when the shell mounts again in the same tab', async () => {
      fakeInbox.setSessions([
        { sessionId: 's1', state: 'input-required', changedAt: 1000 },
      ]);
      const first = await renderShell();
      await waitFor(() => expect(post).toHaveBeenCalledTimes(1));

      // A classic page and back, or a reload: the tab is the same.
      first.unmount();
      await renderShell();
      expect(
        await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
      ).toBeInTheDocument();
      expect(post).toHaveBeenCalledTimes(1);
    });

    it('follows a toast link inside the app, and opens the overlay from "Open notifications"', async () => {
      await renderShell();

      await userEvent.click(screen.getByRole('link', { name: 'Open session' }));
      expect(screen.getByTestId('location')).toHaveTextContent(
        `${SESSION_PATH}/s1`,
      );

      await userEvent.click(
        screen.getByRole('link', { name: 'Open notifications' }),
      );
      expect(
        await screen.findByRole('dialog', { name: 'Notifications' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent(
        `${SESSION_PATH}/s1`,
      );
    });

    it('treats the session on screen in a window behind another as not watched', async () => {
      fakeInbox.setSessions([{ sessionId: 's1', state: 'working' }]);
      await renderShell({ path: `${SESSION_PATH}/s1` });
      await setFocused(false);

      await read([
        { sessionId: 's1', state: 'input-required', changedAt: now() },
      ]);
      expect(toastTitles()).toEqual(['SRE Agent is waiting for you']);
      expect(fakeInbox.writes.markSeen).not.toHaveBeenCalled();

      // Back in the window: the session on screen is read.
      await setFocused(true);
      await waitFor(() =>
        expect(fakeInbox.writes.markSeen).toHaveBeenCalledWith(
          expect.objectContaining({ sessionId: 's1' }),
          undefined,
        ),
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

  describe('MCP sign-in row', () => {
    const MARK = 'mcp-sign-in:gazelle:github,kubernetes';

    /** muster's next sign-in status read answers with `servers`. */
    async function readMcp(
      servers: Array<string | [string, string]>,
      options?: {
        connected?: string[];
        isAvailable?: boolean;
        isRead?: boolean;
      },
    ) {
      await act(async () => {
        fakeInbox.setMcpWaiting(servers, options);
      });
    }

    function mcpRow(overlay: HTMLElement) {
      return within(overlay)
        .getAllByRole('listitem')
        .find(item =>
          /MCP servers? needs? your sign-in/.test(item.textContent!),
        );
    }

    it('lists one row naming the waiting servers, above the session rows, with Sign in', async () => {
      fakeInbox.setMcpWaiting([['kubernetes', 'Kubernetes'], 'github']);
      fakeInbox.setSessions([
        {
          sessionId: 's1',
          title: 'Debug ingress',
          state: 'input-required',
          changedAt: now(),
        },
      ]);
      await renderShell();

      expect(
        await screen.findByRole('button', { name: 'Notifications, 2 unread' }),
      ).toBeInTheDocument();
      const overlay = await openOverlay();
      const rows = within(overlay).getAllByRole('listitem');
      expect(rows.map(row => row.textContent)).toEqual([
        expect.stringContaining('2 MCP servers need your sign-in'),
        expect.stringContaining('SRE Agent needs your input'),
      ]);
      expect(rows[0]).toHaveTextContent('Kubernetes, github');
      expect(
        within(rows[0]).getByText('Unread:', { exact: false }),
      ).toBeInTheDocument();
      expect(
        within(rows[0]).getByRole('button', { name: 'Sign in to MCP servers' }),
      ).toHaveTextContent('Sign in');
      expect(within(rows[0]).queryByRole('link')).not.toBeInTheDocument();
    });

    it('shortens a long list to three names and a count', async () => {
      fakeInbox.setMcpWaiting(['a', 'b', 'c', 'd', 'e']);
      await renderShell();

      const overlay = await openOverlay();
      expect(mcpRow(overlay)).toHaveTextContent(
        '5 MCP servers need your sign-in',
      );
      expect(mcpRow(overlay)).toHaveTextContent('a, b, c and 2 more');
    });

    it('has no row while nothing waits, or muster cannot say', async () => {
      fakeInbox.setMcpWaiting([]);
      await renderShell();
      const overlay = await openOverlay();
      expect(
        within(overlay).getByText('Nothing needs you right now.'),
      ).toBeInTheDocument();

      await readMcp([], { isAvailable: false });
      expect(
        within(overlay).getByText('Nothing needs you right now.'),
      ).toBeInTheDocument();
    });

    it('opens the sign-in dialog in place from Sign in, and marks the row read', async () => {
      fakeInbox.setMcpWaiting(['kubernetes', 'github']);
      await renderShell({ path: '/sessions' });

      const overlay = await openOverlay();
      await userEvent.click(
        within(overlay).getByRole('button', { name: 'Sign in to MCP servers' }),
      );

      expect(
        await screen.findByRole('dialog', { name: 'Sign in to MCP servers' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('dialog', { name: 'Notifications' }),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent('/sessions');
      expect(fakeInbox.writes.markSeen).toHaveBeenCalledWith(
        { kind: 'mcpSignIn', installation: 'gazelle', mark: MARK },
        { action: 'opened', kind: 'mcpSignIn' },
      );
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Notifications', hidden: true }),
        ).toBeInTheDocument(),
      );
    });

    it('goes once the servers are signed in to, through the same read', async () => {
      fakeInbox.setMcpWaiting(['kubernetes']);
      await renderShell();
      await waitFor(() =>
        expect(document.title).toBe('(1) Sessions · Agent Platform'),
      );

      await readMcp([]);
      expect(
        screen.getByRole('button', { name: 'Notifications' }),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(document.title).toBe('Sessions · Agent Platform'),
      );
      const overlay = await openOverlay();
      expect(
        within(overlay).getByText('Nothing needs you right now.'),
      ).toBeInTheDocument();
    });

    it('is unread again when another server starts to wait, not when one is signed in to', async () => {
      fakeInbox.setMcpWaiting(['kubernetes', 'github']);
      fakeInbox.seeElsewhere({
        kind: 'mcpSignIn',
        installation: 'gazelle',
        mark: MARK,
      });
      await renderShell();
      expect(
        await screen.findByRole('button', { name: 'Notifications' }),
      ).toBeInTheDocument();

      // Signed in to github: still read, and the mark keeps only what waits.
      await readMcp(['kubernetes'], { connected: ['github'] });
      expect(
        screen.getByRole('button', { name: 'Notifications' }),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(fakeInbox.mcpSeenMark()).toBe('mcp-sign-in:gazelle:kubernetes'),
      );
      expect(fakeInbox.writes.replaceSeenMark).toHaveBeenCalledWith(
        {
          kind: 'mcpSignIn',
          installation: 'gazelle',
          mark: 'mcp-sign-in:gazelle:kubernetes',
        },
        MARK,
      );

      // github's grant expires: it waits again, and the row is unread.
      await readMcp(['kubernetes', 'github']);
      expect(
        screen.getByRole('button', { name: 'Notifications, 1 unread' }),
      ).toBeInTheDocument();
    });

    it('keeps a server in the seen mark that only left muster’s list, not signed in to', async () => {
      fakeInbox.setMcpWaiting(['kubernetes', 'github']);
      fakeInbox.seeElsewhere({
        kind: 'mcpSignIn',
        installation: 'gazelle',
        mark: MARK,
      });
      await renderShell();
      expect(
        await screen.findByRole('button', { name: 'Notifications' }),
      ).toBeInTheDocument();

      // muster restarted and has not registered github yet.
      await readMcp(['kubernetes']);
      await readMcp(['kubernetes', 'github']);
      expect(fakeInbox.writes.replaceSeenMark).not.toHaveBeenCalled();
      expect(
        screen.getByRole('button', { name: 'Notifications' }),
      ).toBeInTheDocument();
      expect(post).not.toHaveBeenCalled();
    });

    it('keeps a seen mark written since elsewhere when it narrows', async () => {
      fakeInbox.setMcpWaiting(['kubernetes', 'github']);
      fakeInbox.seeElsewhere({
        kind: 'mcpSignIn',
        installation: 'gazelle',
        mark: MARK,
      });
      // Another device reads the row with jira while this tab still has the
      // older mark: the write finds a mark it did not read and keeps it.
      fakeInbox.writes.replaceSeenMark.mockImplementationOnce(async () => {
        fakeInbox.seeElsewhere({
          kind: 'mcpSignIn',
          installation: 'gazelle',
          mark: 'mcp-sign-in:gazelle:jira,kubernetes',
        });
      });
      await renderShell();

      await readMcp(['kubernetes'], { connected: ['github'] });
      await waitFor(() =>
        expect(fakeInbox.mcpSeenMark()).toBe(
          'mcp-sign-in:gazelle:jira,kubernetes',
        ),
      );
    });

    it('tries a failed narrowing again', async () => {
      jest.useFakeTimers({ doNotFake: ['requestAnimationFrame'] });
      try {
        fakeInbox.setMcpWaiting(['kubernetes', 'github']);
        fakeInbox.seeElsewhere({
          kind: 'mcpSignIn',
          installation: 'gazelle',
          mark: MARK,
        });
        fakeInbox.writes.replaceSeenMark.mockRejectedValueOnce(
          new Error('offline'),
        );
        await renderShell();

        await readMcp(['kubernetes'], { connected: ['github'] });
        await waitFor(() =>
          expect(fakeInbox.writes.replaceSeenMark).toHaveBeenCalledTimes(1),
        );
        expect(fakeInbox.mcpSeenMark()).toBe(MARK);

        await act(async () => {
          jest.advanceTimersByTime(NARROW_RETRY_MS);
        });
        await waitFor(() =>
          expect(fakeInbox.mcpSeenMark()).toBe(
            'mcp-sign-in:gazelle:kubernetes',
          ),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('is covered by "Mark all read", in the same write as the session rows', async () => {
      fakeInbox.setMcpWaiting(['kubernetes', 'github']);
      fakeInbox.setSessions([{ sessionId: 's1', state: 'input-required' }]);
      await renderShell();

      const overlay = await openOverlay();
      await userEvent.click(
        within(overlay).getByRole('button', { name: 'Mark all read' }),
      );
      expect(fakeInbox.writes.markManySeen).toHaveBeenCalledTimes(1);
      expect(fakeInbox.writes.markManySeen).toHaveBeenCalledWith(
        [
          { kind: 'mcpSignIn', installation: 'gazelle', mark: MARK },
          expect.objectContaining({ kind: 'session', sessionId: 's1' }),
        ],
        { action: 'markedAllRead' },
      );
      await waitFor(() =>
        expect(document.title).toBe('Sessions · Agent Platform'),
      );
    });

    it('counts in the one summary toast of the first read', async () => {
      fakeInbox.setMcpWaiting(['kubernetes']);
      fakeInbox.setSessions([
        { sessionId: 's1', state: 'input-required', changedAt: 1000 },
      ]);
      await renderShell();

      await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
      expect(toastTitles()).toEqual(['2 notifications need your attention']);
    });

    it('does not hold the first read up: a status that answers after it is quietly unread', async () => {
      fakeInbox.setMcpWaiting([], { isRead: false, isAvailable: false });
      fakeInbox.setSessions([
        { sessionId: 's1', state: 'input-required', changedAt: 1000 },
      ]);
      await renderShell();
      await waitFor(() =>
        expect(toastTitles()).toEqual(['1 session needs your attention']),
      );

      await readMcp(['kubernetes']);
      expect(toastTitles()).toEqual(['1 session needs your attention']);
      expect(
        screen.getByRole('button', { name: 'Notifications, 2 unread' }),
      ).toBeInTheDocument();
    });

    it('toasts a server that starts to wait after the first read, with a Sign in that opens the dialog', async () => {
      await renderShell();

      await readMcp([['kubernetes', 'Kubernetes']]);
      expect(post).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledWith({
        title: '1 MCP server needs your sign-in',
        description: 'Kubernetes',
        status: 'warning',
        links: [{ label: 'Sign in', href: '#mcp-sign-in' }],
      });

      // The toast's Sign in: the dialog where the person is, the row read.
      await userEvent.click(screen.getByRole('link', { name: 'Sign in' }));
      expect(
        await screen.findByRole('dialog', { name: 'Sign in to MCP servers' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
      expect(fakeInbox.writes.markSeen).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'mcpSignIn' }),
        { action: 'opened', kind: 'mcpSignIn' },
      );
      await waitFor(() => expect(close).toHaveBeenCalled());
    });

    it('waits for the sign-in status before acting on #mcp-sign-in in the address', async () => {
      fakeInbox.setMcpWaiting([], { isRead: false, isAvailable: false });
      await renderShell({ path: '/sessions#mcp-sign-in' });
      expect(
        screen.queryByRole('dialog', { name: 'Sign in to MCP servers' }),
      ).not.toBeInTheDocument();

      await readMcp(['kubernetes']);
      expect(
        await screen.findByRole('dialog', { name: 'Sign in to MCP servers' }),
      ).toBeInTheDocument();
      expect(fakeInbox.writes.markSeen).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'mcpSignIn' }),
        { action: 'opened', kind: 'mcpSignIn' },
      );
      expect(screen.getByTestId('location')).toHaveTextContent('/sessions');
    });

    it('does nothing for #mcp-sign-in once nothing waits', async () => {
      await renderShell({ path: '/sessions#mcp-sign-in' });

      await waitFor(() =>
        expect(screen.getByTestId('location')).toHaveTextContent(
          /^\/sessions$/,
        ),
      );
      expect(
        screen.queryByRole('dialog', { name: 'Sign in to MCP servers' }),
      ).not.toBeInTheDocument();
    });

    it('opens the sign-in dialog from #mcp-sign-in in the address', async () => {
      fakeInbox.setMcpWaiting(['kubernetes']);
      await renderShell({ path: '/sessions#mcp-sign-in' });

      expect(
        await screen.findByRole('dialog', { name: 'Sign in to MCP servers' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent('/sessions');
    });

    it('raises nothing when fewer servers wait', async () => {
      await renderShell();
      await readMcp(['kubernetes', 'github']);
      expect(post).toHaveBeenCalledTimes(1);

      // github signed in on a muster page: the toast says too much and goes,
      // and no new one comes.
      await readMcp(['kubernetes']);
      expect(close).toHaveBeenCalledTimes(1);
      expect(post).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole('button', { name: 'Notifications, 1 unread' }),
      ).toBeInTheDocument();

      // A server that starts to wait is news again.
      await readMcp(['kubernetes', 'jira']);
      expect(toastTitles()).toEqual([
        '2 MCP servers need your sign-in',
        '2 MCP servers need your sign-in',
      ]);
    });
  });

  describe('desktop notifications', () => {
    let requestPermission: jest.Mock;
    let shown: Array<{
      title: string;
      options: NotificationOptions;
      notification: { onclick: (() => void) | null };
    }>;
    const original = window.Notification;

    function installNotification(permission: NotificationPermission) {
      shown = [];
      class FakeNotification {
        static permission: NotificationPermission = permission;
        static requestPermission: jest.Mock;
        onclick: (() => void) | null = null;
        constructor(title: string, options: NotificationOptions) {
          shown.push({ title, options, notification: this });
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

    // The person works in another window.
    beforeEach(() => {
      focused = false;
    });

    afterEach(() => {
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
          notification: expect.anything(),
        },
      ]);
    });

    it('opens the overlay from a burst, and closes the toast that points there', async () => {
      installNotification('granted');
      window.localStorage.setItem(DESKTOP_NOTIFICATIONS_STORAGE_KEY, 'on');
      const ids = ['s1', 's2', 's3', 's4'];
      fakeInbox.setSessions(
        ids.map(sessionId => ({ sessionId, state: 'working' })),
      );
      await renderShell();

      await read(
        ids.map((sessionId, index) => ({
          sessionId,
          state: index < 2 ? 'input-required' : 'failed',
          portalStarted: true,
          changedAt: now(),
        })),
      );
      expect(toastTitles()).toEqual(['4 sessions need your attention']);
      expect(shown.map(each => each.title)).toEqual([
        '4 sessions need your attention',
      ]);

      await act(async () => {
        shown[0].notification.onclick?.();
      });
      expect(
        await screen.findByRole('dialog', { name: 'Notifications' }),
      ).toBeInTheDocument();
      expect(close).toHaveBeenCalled();
    });

    it('raises the MCP sign-in row, and opens the sign-in dialog from it', async () => {
      installNotification('granted');
      window.localStorage.setItem(DESKTOP_NOTIFICATIONS_STORAGE_KEY, 'on');
      await renderShell();

      await act(async () => {
        fakeInbox.setMcpWaiting([['kubernetes', 'Kubernetes']]);
      });
      expect(shown).toEqual([
        {
          title: '1 MCP server needs your sign-in',
          options: {
            body: 'Kubernetes',
            tag: 'mcp-sign-in:gazelle:kubernetes',
            silent: true,
          },
          notification: expect.anything(),
        },
      ]);

      await act(async () => {
        shown[0].notification.onclick?.();
      });
      expect(
        await screen.findByRole('dialog', { name: 'Sign in to MCP servers' }),
      ).toBeInTheDocument();
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
