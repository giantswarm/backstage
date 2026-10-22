import { useState } from 'react';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MENU_WIDTH, saveFile } from '@giantswarm/backstage-plugin-ui-react';
import { sessionsRouteRef } from '../../routes';
import type { UseDeleteSessionResult } from '../../hooks/useDeleteSession';
import type { NotificationLevel } from '../../lib/notificationRecord';
import type { RawSessionBodies } from '../../apis/types';
import {
  exportedTasksBucket,
  useExportSession,
} from '../../hooks/useExportSession';
import { SessionActionsMenu } from './SessionActionsMenu';

// The delete state arrives as a prop — the menu renders in the shared plugin
// header, outside the plugin's QueryClientProvider, so it cannot call the hook
// itself. This test is therefore about what the menu offers and what it does with
// the outcome; the request and the cache handling are covered by
// useDeleteSession.test.tsx.
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockToastPost = jest.fn();
const mockGetRawSession = jest.fn();

// Only the toast API and the kagent client are swapped out — everything else
// the test app looks up (themes, route resolution) has to keep working.
jest.mock('@backstage/frontend-plugin-api', () => {
  const actual = jest.requireActual('@backstage/frontend-plugin-api');

  return {
    ...actual,
    useApi: (ref: { id: string }) => {
      if (ref === actual.toastApiRef) {
        return { post: mockToastPost };
      }
      if (ref.id === 'plugin.agent-platform.kagent') {
        return { getRawSession: mockGetRawSession };
      }
      return actual.useApi(ref);
    },
  };
});

// The file is what the export is about: captured here rather than saved.
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  saveFile: jest.fn(),
}));
const mockSaveFile = saveFile as jest.MockedFunction<typeof saveFile>;

const deleteSession = jest.fn();
const reset = jest.fn();
const onRename = jest.fn();

let deletion: UseDeleteSessionResult;

function setDeleteState(overrides: Partial<UseDeleteSessionResult> = {}) {
  deletion = {
    deleteSession,
    isDeleting: false,
    error: null,
    reset,
    ...overrides,
  } as UseDeleteSessionResult;
}

const renderMenu = (isUserScoped?: boolean) =>
  renderInTestApp(
    <SessionActionsMenu
      title="What issues are assigned to me?"
      deletion={deletion}
      onRename={onRename}
      isUserScoped={isUserScoped}
    />,
    { mountedRoutes: { '/sessions': sessionsRouteRef } },
  );

async function openMenu() {
  await userEvent.click(
    screen.getByRole('button', { name: 'Session actions' }),
  );
}

async function openDeleteDialog() {
  await openMenu();
  await userEvent.click(
    screen.getByRole('menuitem', { name: /Delete session/ }),
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockToastPost.mockReset();
  mockToastPost.mockReturnValue({ close: jest.fn() });
  mockGetRawSession.mockReset();
  mockSaveFile.mockReset();
  deleteSession.mockReset();
  deleteSession.mockResolvedValue(undefined);
  reset.mockReset();
  onRename.mockReset();
  setDeleteState();
});

describe('SessionActionsMenu', () => {
  it('renders without a QueryClient in scope', async () => {
    // The regression this file exists to prevent. The menu is rendered into the
    // shared plugin header, which is outside the plugin's QueryClientProvider, so
    // a react-query hook called here throws "No QueryClient set" and takes the
    // whole page down with it — the delete state has to arrive as a prop.
    // `renderInTestApp` deliberately provides no client, so this asserts it.
    await renderMenu();

    expect(
      screen.getByRole('button', { name: 'Session actions' }),
    ).toBeInTheDocument();
  });

  it('offers no pin unless the page hands one over', async () => {
    await renderMenu();

    expect(
      screen.queryByRole('button', { name: /Pin session/ }),
    ).not.toBeInTheDocument();
  });

  it('puts the pin before the menu and says whether the session is pinned', async () => {
    const onToggle = jest.fn();
    function Harness() {
      const [isPinned, setPinned] = useState(false);
      return (
        <SessionActionsMenu
          title="What issues are assigned to me?"
          deletion={deletion}
          onRename={onRename}
          pin={{
            isPinned,
            onToggle: () => {
              onToggle();
              setPinned(pinned => !pinned);
            },
          }}
        />
      );
    }
    await renderInTestApp(<Harness />, {
      mountedRoutes: { '/sessions': sessionsRouteRef },
    });

    const pin = screen.getByRole('button', { name: 'Pin session' });
    expect(pin).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(pin);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Unpin session' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('gives the menu a definite width', async () => {
    // Not cosmetic, and the reason is invisible from here: bui leaves the menu's
    // width to its content above a 150px minimum, and this menu's one item wants
    // slightly more than that — so the popover renders wide, settles back to the
    // minimum, and that second layout pass makes react-aria's resize observer
    // trip the browser's "ResizeObserver loop completed with undelivered
    // notifications", which the dev-server overlay throws in your face on every
    // open. See the comment on MENU_WIDTH. jsdom does no layout, so this can only
    // assert the width is set — that is still enough to catch its removal.
    await renderMenu();
    await openMenu();

    // Read the specified value rather than using `toHaveStyle`: that goes
    // through getComputedStyle, which resolves `rem` against the root font size
    // since jsdom 29, so it reports `192px` and says nothing about what the
    // component asked for.
    expect(screen.getByRole('menu').style.width).toBe(MENU_WIDTH);
  });

  it('says what deleting actually means before doing it', async () => {
    await renderMenu();
    await openDeleteDialog();

    await waitFor(() => {
      expect(
        screen.getByText('Delete session "What issues are assigned to me?"?'),
      ).toBeInTheDocument();
    });
    // Both halves of the truth: gone as far as anyone here is concerned, and not
    // restorable from this UI, but not erased from kagent either.
    expect(
      screen.getByText(/can no longer be listed or opened/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cannot be restored\s+from here/),
    ).toBeInTheDocument();
    // Opening the dialog does not delete anything.
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it('warns when the deployment does not scope sessions per user', async () => {
    // `unsecure` mode: kagent ignores the forwarded identity and serves one shared
    // user, so the session on screen may be somebody else's. It warns rather than
    // withholding — kagent authorizes the call either way, and the reader is the
    // one who knows whose session this is.
    await renderMenu(false);
    await openDeleteDialog();

    expect(
      await screen.findByText(/someone else may\s+have started this session/),
    ).toBeInTheDocument();
  });

  it.each([
    ['user-scoped', true],
    ['unresolved', undefined],
  ])('claims nothing when the probe says %s', async (_label, isUserScoped) => {
    await renderMenu(isUserScoped);
    await openDeleteDialog();

    await waitFor(() => {
      expect(
        screen.getByText(/can no longer be listed or opened/),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByText(/someone else may\s+have started this session/),
    ).not.toBeInTheDocument();
  });

  it('confirms, reports and returns to the list on success', async () => {
    await renderMenu();
    await openDeleteDialog();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete session' }),
    );

    await waitFor(() => {
      expect(deleteSession).toHaveBeenCalledTimes(1);
    });

    expect(mockToastPost).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'success',
        // Permanent unless a timeout is given, and this is an acknowledgement.
        timeout: expect.any(Number),
      }),
    );
    // Past tense, unlike the agent's "Deleting…": kagent's delete is synchronous,
    // so nothing is still settling by the time this shows.
    expect(mockToastPost.mock.calls[0][0].title).toMatch(
      /Session "What issues are assigned to me\?" deleted/,
    );
    expect(mockNavigate).toHaveBeenCalledWith('/sessions');

    await waitFor(() => {
      expect(
        screen.queryByText('Delete session "What issues are assigned to me?"?'),
      ).not.toBeInTheDocument();
    });
  });

  it('stays on the list when deleting from a row of it', async () => {
    await renderInTestApp(
      <SessionActionsMenu
        title="What issues are assigned to me?"
        deletion={deletion}
        onRename={onRename}
        triggerLabel="More actions for “What issues are assigned to me?”"
      />,
      {
        mountedRoutes: { '/sessions': sessionsRouteRef },
        initialRouteEntries: ['/sessions'],
      },
    );
    await userEvent.click(
      screen.getByRole('button', {
        name: 'More actions for “What issues are assigned to me?”',
      }),
    );
    await userEvent.click(
      screen.getByRole('menuitem', { name: /Delete session/ }),
    );
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete session' }),
    );

    await waitFor(() => {
      expect(mockToastPost).toHaveBeenCalledTimes(1);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and says nothing succeeded when the delete fails', async () => {
    deleteSession.mockRejectedValue(new Error('kagent returned status 500'));
    setDeleteState({ error: new Error('kagent returned status 500') });

    await renderMenu();
    await openDeleteDialog();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete session' }),
    );

    await waitFor(() => {
      expect(deleteSession).toHaveBeenCalledTimes(1);
    });

    expect(
      screen.getByText('Delete session "What issues are assigned to me?"?'),
    ).toBeInTheDocument();
    expect(screen.getByText('kagent returned status 500')).toBeInTheDocument();
    expect(mockToastPost).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('clears a previous failure when the dialog is reopened', async () => {
    await renderMenu();
    await openDeleteDialog();

    expect(reset).toHaveBeenCalled();
  });

  it('hands the rename back to the page instead of opening a dialog itself', async () => {
    // Rename is the one action whose dialog the menu does not own: the page title
    // opens the same dialog, so the state lives on the page. All this item does is
    // call back.
    await renderMenu();
    await openMenu();
    await userEvent.click(
      screen.getByRole('menuitem', { name: /Rename session/ }),
    );

    expect(onRename).toHaveBeenCalledTimes(1);
    // Nothing destructive is anywhere near it.
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it('keeps the destructive action below the safe one', async () => {
    // Ordering is a safety property, not a style choice: the delete sits under the
    // pointer's resting position if it comes first, and this menu is opened far more
    // often to rename than to delete.
    await renderMenu();
    await openMenu();

    const items = screen.getAllByRole('menuitem').map(item => item.textContent);
    expect(items).toEqual([
      expect.stringMatching(/Rename session/),
      expect.stringMatching(/Delete session/),
    ]);
  });
});

describe('SessionActionsMenu — Notifications', () => {
  /** The menu with a level the test controls, as a page hands it over. */
  function Harness({
    initial,
    onChange,
  }: {
    initial: NotificationLevel | undefined;
    onChange: (level: NotificationLevel) => Promise<void>;
  }) {
    const [level, setLevel] = useState(initial);
    return (
      <SessionActionsMenu
        title="What issues are assigned to me?"
        deletion={deletion}
        onRename={onRename}
        notifications={{
          level,
          onChange: async next => {
            await onChange(next);
            setLevel(next);
          },
        }}
      />
    );
  }

  const renderWithLevel = (
    initial: NotificationLevel | undefined,
    onChange: (level: NotificationLevel) => Promise<void> = jest
      .fn()
      .mockResolvedValue(undefined),
  ) =>
    renderInTestApp(<Harness initial={initial} onChange={onChange} />, {
      mountedRoutes: { '/sessions': sessionsRouteRef },
    });

  async function openNotifications() {
    await openMenu();
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Notifications' }),
    );
    return screen.findByRole('menu', { name: 'Notifications' });
  }

  function levelItem(name: string) {
    return screen.getByRole('menuitemradio', { name });
  }

  it('offers no Notifications item unless the page hands the level over', async () => {
    await renderMenu();
    await openMenu();

    expect(
      screen.queryByRole('menuitem', { name: 'Notifications' }),
    ).not.toBeInTheDocument();
  });

  it('sits between rename and delete, which stays last', async () => {
    await renderWithLevel('default');
    await openMenu();

    const items = screen.getAllByRole('menuitem').map(item => item.textContent);
    expect(items).toEqual([
      expect.stringMatching(/Rename session/),
      expect.stringMatching(/Notifications/),
      expect.stringMatching(/Delete session/),
    ]);
  });

  it.each`
    level        | ticked
    ${'default'} | ${'Default'}
    ${'all'}     | ${'All activity'}
    ${'muted'}   | ${'Muted'}
  `('ticks $ticked for a session at $level', async ({ level, ticked }) => {
    await renderWithLevel(level);
    await openNotifications();

    for (const name of ['Default', 'All activity', 'Muted']) {
      expect(levelItem(name)).toHaveAttribute(
        'aria-checked',
        String(name === ticked),
      );
    }
  });

  it('ticks nothing while the stored level is still being read', async () => {
    await renderWithLevel(undefined);
    await openNotifications();

    for (const name of ['Default', 'All activity', 'Muted']) {
      expect(levelItem(name)).toHaveAttribute('aria-checked', 'false');
    }
  });

  it('sets the chosen level, closes the menu and ticks it on the next opening', async () => {
    const onChange = jest.fn().mockResolvedValue(undefined);
    await renderWithLevel('default', onChange);
    await openNotifications();

    await userEvent.click(levelItem('Muted'));

    expect(onChange).toHaveBeenCalledWith('muted');
    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
    await openNotifications();
    expect(levelItem('Muted')).toHaveAttribute('aria-checked', 'true');
    expect(levelItem('Default')).toHaveAttribute('aria-checked', 'false');
  });

  it('ticks the chosen level at once, while its write is still under way', async () => {
    // A tick that moved only once the round trip ended changed the menu as
    // it closed: a flicker.
    let finishWrite: () => void = () => {};
    const onChange = jest.fn(
      () => new Promise<void>(resolve => (finishWrite = resolve)),
    );
    await renderWithLevel('default', onChange);
    await openNotifications();

    await userEvent.click(levelItem('All activity'));
    await waitFor(() =>
      expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
    );
    await openNotifications();

    expect(levelItem('All activity')).toHaveAttribute('aria-checked', 'true');
    expect(levelItem('Default')).toHaveAttribute('aria-checked', 'false');

    finishWrite();
    await waitFor(() =>
      expect(levelItem('All activity')).toHaveAttribute('aria-checked', 'true'),
    );
  });

  it('unmutes with Default', async () => {
    const onChange = jest.fn().mockResolvedValue(undefined);
    await renderWithLevel('muted', onChange);
    await openNotifications();

    await userEvent.click(levelItem('Default'));

    expect(onChange).toHaveBeenCalledWith('default');
  });

  it('writes nothing when the current level is chosen again', async () => {
    const onChange = jest.fn().mockResolvedValue(undefined);
    await renderWithLevel('all', onChange);
    await openNotifications();

    await userEvent.click(levelItem('All activity'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('says so when the level could not be stored, and keeps the stored one ticked', async () => {
    const onChange = jest.fn().mockRejectedValue(new Error('backend down'));
    await renderWithLevel('default', onChange);
    await openNotifications();

    await userEvent.click(levelItem('All activity'));

    await waitFor(() =>
      expect(mockToastPost).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Could not change the session’s notifications',
          status: 'danger',
          timeout: expect.any(Number),
        }),
      ),
    );
    await openNotifications();
    expect(levelItem('Default')).toHaveAttribute('aria-checked', 'true');
  });
});

describe('SessionActionsMenu — deleting a session whose runtime is lost', () => {
  const unavailable = new Error(
    "The kagent API for installation 'gazelle' is unavailable: Failed to delete AgentInstance",
  );

  it('says why the delete failed and what fixes it, keeping the backend’s words', async () => {
    // kagent suspends the runtime before removing the instance, and that suspend
    // dials a node that no longer exists — the backend's `Failed to delete
    // AgentInstance` says none of that.
    setDeleteState({ error: unavailable });
    await renderInTestApp(
      <SessionActionsMenu
        title="Plan a barbecue"
        deletion={deletion}
        onRename={onRename}
        runtimeLoss={{
          reported: false,
          cause: 'request timed out',
          attempts: 2,
        }}
      />,
      { mountedRoutes: { '/sessions': sessionsRouteRef } },
    );
    await openDeleteDialog();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(
      /it suspends the runtime first, and this runtime was lost/,
    );
    expect(dialog).toHaveTextContent(/A kagent fix is coming/);
    expect(dialog).toHaveTextContent(unavailable.message);
  });

  it('leaves any other failed delete with the backend’s message alone', async () => {
    setDeleteState({ error: unavailable });
    await renderInTestApp(
      <SessionActionsMenu
        title="Plan a barbecue"
        deletion={deletion}
        onRename={onRename}
      />,
      { mountedRoutes: { '/sessions': sessionsRouteRef } },
    );
    await openDeleteDialog();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(unavailable.message);
    expect(dialog).not.toHaveTextContent(/suspends a session’s runtime/);
  });
});

describe('SessionActionsMenu — Export session', () => {
  /** kagent's `Session`, as the session route answers it. */
  const session = {
    id: 'Ab12-session',
    name: 'Why is the pod pending?',
    agent: { namespace: 'kagent', name: 'sre-agent' },
    creator: 'dev@lab.local',
    preparedRevision: 'rev-7',
    state: 'SESSION_STATE_READY',
  };

  /**
   * One task for every way tool calls are spelled: the canonical part-type
   * key current kagent writes, the legacy `adk_type` and `kagent_type` of
   * older history, and an MCP result nested inside the function response.
   */
  const tasks = [
    {
      id: 'task-1',
      contextId: 'Ab12-session',
      status: { state: 'TASK_STATE_COMPLETED' },
      history: [
        {
          messageId: 'm-1',
          role: 'ROLE_USER',
          parts: [{ text: 'Why is the pod pending?' }],
        },
        {
          messageId: 'm-2',
          role: 'ROLE_AGENT',
          parts: [
            {
              data: {
                id: 'call-1',
                name: 'kubernetes_get',
                args: { kind: 'Pod', name: 'web-0' },
              },
              metadata: { 'kagent.dev/a2a/part-type': 'function_call' },
            },
          ],
        },
      ],
      artifacts: [
        {
          artifactId: 'a-1',
          parts: [
            {
              data: {
                id: 'call-1',
                name: 'kubernetes_get',
                response: {
                  result: {
                    content: [
                      {
                        type: 'text',
                        text: '{"status":{"phase":"Pending"}}',
                      },
                    ],
                    structuredContent: { status: { phase: 'Pending' } },
                    isError: false,
                  },
                },
              },
              metadata: { 'kagent.dev/a2a/part-type': 'function_response' },
            },
          ],
        },
      ],
    },
    {
      id: 'task-2',
      contextId: 'Ab12-session',
      status: { state: 'TASK_STATE_COMPLETED' },
      history: [
        {
          messageId: 'm-3',
          role: 'ROLE_AGENT',
          parts: [
            {
              data: { id: 'call-2', name: 'kubectl_get', args: {} },
              metadata: { adk_type: 'function_call' },
            },
            {
              data: { id: 'call-2', name: 'kubectl_get', response: {} },
              metadata: { kagent_type: 'function_response' },
            },
          ],
        },
      ],
    },
  ];

  const complete: RawSessionBodies = {
    sessionBody: { session },
    tasksBody: { tasks, totalSize: tasks.length },
  };

  function Harness() {
    const onExport = useExportSession({
      installation: 'gazelle',
      sessionId: 'Ab12-session',
      agentName: 'sre-agent',
    });
    return (
      <SessionActionsMenu
        title="Why is the pod pending?"
        deletion={deletion}
        onRename={onRename}
        onExport={onExport}
      />
    );
  }

  const analyticsApi = mockApis.analytics.mock();

  // No QueryClientProvider, as in the shared header: the export runs on a
  // client of its own.
  const renderWithExport = () =>
    renderInTestApp(
      <TestApiProvider apis={[[analyticsApiRef, analyticsApi]]}>
        <Harness />
      </TestApiProvider>,
      { mountedRoutes: { '/sessions': sessionsRouteRef } },
    );

  beforeEach(() => {
    jest.mocked(analyticsApi.captureEvent).mockClear();
  });

  async function exportSession() {
    await openMenu();
    await userEvent.click(
      screen.getByRole('menuitem', { name: /Export session/ }),
    );
  }

  /** The toasts posted so far, by title. */
  const toastTitles = () =>
    mockToastPost.mock.calls.map(([toast]) => toast.title);

  it('offers no export unless the page hands one over', async () => {
    await renderMenu();
    await openMenu();

    expect(
      screen.queryByRole('menuitem', { name: /Export session/ }),
    ).not.toBeInTheDocument();
  });

  it('sits above delete, which stays last, as one plain item', async () => {
    await renderWithExport();
    await openMenu();

    const items = screen.getAllByRole('menuitem').map(item => item.textContent);
    expect(items).toEqual([
      expect.stringMatching(/Rename session/),
      expect.stringMatching(/Export session/),
      expect.stringMatching(/Delete session/),
    ]);
    const item = screen.getByRole('menuitem', { name: 'Export session' });
    expect(item).toHaveTextContent(/^Export session$/);
    // It is an export, never a download, wherever the person reads it.
    expect(item).not.toHaveTextContent(/download/i);
  });

  it('saves the session and its tasks unchanged, inside the envelope', async () => {
    mockGetRawSession.mockResolvedValue(complete);
    await renderWithExport();

    const before = Date.now();
    await exportSession();

    await waitFor(() => expect(mockSaveFile).toHaveBeenCalledTimes(1));
    expect(mockGetRawSession).toHaveBeenCalledWith('gazelle', 'Ab12-session');
    const [content, fileName, contentType] = mockSaveFile.mock.calls[0];
    expect(fileName).toBe('sre-agent-session-Ab12-session.json');
    expect(contentType).toBe('application/json');

    const saved = JSON.parse(content);
    expect(Object.keys(saved)).toEqual([
      'formatVersion',
      'exportedAt',
      'installation',
      'session',
      'tasks',
    ]);
    expect(saved.formatVersion).toBe(1);
    expect(saved.installation).toBe('gazelle');
    expect(Date.parse(saved.exportedAt)).toBeGreaterThanOrEqual(
      Math.floor(before / 1000) * 1000,
    );
    expect(saved.exportedAt).toMatch(/Z$/);
    // Verbatim: every part-type spelling and the nested MCP result as they
    // came, nothing normalized.
    expect(saved.session).toEqual(session);
    expect(saved.tasks).toEqual(tasks);

    expect(toastTitles()).toContain('Session exported');
    // Counted with the size of the session in a coarse bucket, and nothing
    // that names the session, its agent or its installation.
    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.sessionExported',
        attributes: { tasks: '1-9' },
      }),
    );
  });

  it.each`
    count   | bucket
    ${0}    | ${'0'}
    ${1}    | ${'1-9'}
    ${9}    | ${'1-9'}
    ${10}   | ${'10-99'}
    ${99}   | ${'10-99'}
    ${100}  | ${'100+'}
    ${1000} | ${'100+'}
  `('counts $count tasks as $bucket', ({ count, bucket }) => {
    expect(exportedTasksBucket(count)).toBe(bucket);
  });

  it('exports a session that has never run, with no tasks', async () => {
    // proto3 JSON leaves an empty list and a zero out.
    mockGetRawSession.mockResolvedValue({
      sessionBody: { session },
      tasksBody: {},
    });
    await renderWithExport();
    await exportSession();

    await waitFor(() => expect(mockSaveFile).toHaveBeenCalledTimes(1));
    expect(JSON.parse(mockSaveFile.mock.calls[0][0]).tasks).toEqual([]);
  });

  /** The failure toast's description, once the export has given up. */
  async function failureDescription() {
    await waitFor(() =>
      expect(mockToastPost).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Could not export the session',
          status: 'danger',
        }),
      ),
    );
    expect(mockSaveFile).not.toHaveBeenCalled();
    expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
    return mockToastPost.mock.calls.find(
      ([toast]) => toast.status === 'danger',
    )![0].description;
  }

  /** A failed request, as the kagent client throws it. */
  const requestError = (status: number, name = 'Error') =>
    Object.assign(new Error(`kagent request failed with status ${status}`), {
      name,
      status,
      requestId: 'req-9',
    });

  it('saves nothing and points to get_session when kagent counts more tasks than came back', async () => {
    mockGetRawSession.mockResolvedValue({
      sessionBody: { session },
      tasksBody: { tasks, totalSize: 1204 },
    });
    await renderWithExport();
    await exportSession();

    const description = await failureDescription();
    expect(description).toMatch(
      /1,204 turns, more than the portal can export at once/,
    );
    expect(description).toMatch(/get_session tool with detail: full/);
  });

  it('saves nothing when the read was cut short, even with no count from kagent', async () => {
    // The route kept the page token it did not follow; the controller left
    // `total_size` unset, so the count alone would read as complete.
    mockGetRawSession.mockResolvedValue({
      sessionBody: { session },
      tasksBody: { tasks, nextPageToken: 'p10' },
    });
    await renderWithExport();
    await exportSession();

    const description = await failureDescription();
    expect(description).toMatch(
      /This session has more turns than the portal can export at once/,
    );
    expect(description).toMatch(/get_session/);
  });

  it('saves nothing for a session whose turns it cannot read', async () => {
    // Recorded by an older controller: the tasks route lists by the session
    // id, which is not this session's context, and would find no tasks.
    mockGetRawSession.mockResolvedValue({
      sessionBody: { session: { ...session, contextId: 'older-context' } },
      tasksBody: {},
    });
    await renderWithExport();
    await exportSession();

    expect(await failureDescription()).toBe(
      'This session was recorded by an older version of kagent, and the portal cannot read its turns.',
    );
  });

  it('says not found, never forbidden, for a session that is gone or someone else’s', async () => {
    // The session read goes first, and kagent answers it 404 for both.
    mockGetRawSession.mockRejectedValue(requestError(404, 'NotFoundError'));
    await renderWithExport();
    await exportSession();

    expect(await failureDescription()).toBe(
      'The session no longer exists, or it belongs to someone else.',
    );
  });

  it.each`
    read                                  | error                                      | description
    ${'denied by the gateway'}            | ${requestError(403, 'ForbiddenError')}     | ${'The session could not be read: permission denied, request id req-9.'}
    ${'a 400 the client calls not found'} | ${requestError(400, 'NotFoundError')}      | ${'The session could not be read: request failed, request id req-9.'}
    ${'a failed tasks read'}              | ${requestError(502)}                       | ${'The session could not be read: server error, request id req-9.'}
    ${'signed out'}                       | ${requestError(401)}                       | ${'The session could not be read: authentication failed, request id req-9.'}
    ${'not JSON'}                         | ${new SyntaxError("Unexpected token '<'")} | ${'The session could not be read: request failed.'}
  `(
    'saves nothing and says why, in its own words, for $read',
    async ({ error, description }) => {
      mockGetRawSession.mockRejectedValue(error);
      await renderWithExport();
      await exportSession();

      expect(await failureDescription()).toBe(description);
    },
  );

  it('passes on kagent’s own words for an error it reported in the body', async () => {
    mockGetRawSession.mockResolvedValue({
      sessionBody: { error: true, message: 'database down' },
      tasksBody: {},
    });
    await renderWithExport();
    await exportSession();

    expect(await failureDescription()).toBe(
      'kagent reported an error: database down',
    );
  });

  it('saves nothing when the tasks come back in a form it does not know', async () => {
    mockGetRawSession.mockResolvedValue({
      sessionBody: { session },
      tasksBody: { error: false, data: tasks },
    });
    await renderWithExport();
    await exportSession();

    expect(await failureDescription()).toBe(
      'The session’s tasks came back in a form the portal does not recognize.',
    );
  });

  it('still exports when the tasks body carries a field it does not know', async () => {
    mockGetRawSession.mockResolvedValue({
      sessionBody: { session },
      tasksBody: { tasks, totalSize: tasks.length, aFieldAddedLater: 1 },
    });
    await renderWithExport();
    await exportSession();

    await waitFor(() => expect(mockSaveFile).toHaveBeenCalledTimes(1));
  });

  it('closes its progress toast once the export settles', async () => {
    const close = jest.fn();
    mockToastPost.mockReturnValue({ close });
    mockGetRawSession.mockResolvedValue(complete);
    await renderWithExport();
    await exportSession();

    await waitFor(() => expect(mockSaveFile).toHaveBeenCalledTimes(1));
    expect(toastTitles()[0]).toBe('Exporting the session…');
    expect(close).toHaveBeenCalled();
  });
});
