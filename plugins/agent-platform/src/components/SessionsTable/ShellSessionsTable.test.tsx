import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { StorageApi, storageApiRef } from '@backstage/core-plugin-api';
import { act, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { SessionStateEntry } from '@giantswarm/backstage-plugin-agent-platform-common';
import { FleetSessionStatesView } from '../../hooks/useFleetSessionStates';
import { SessionRow } from '../SessionsDataProvider/helpers';
import { sessionsRouteRef } from '../../routes';
import { SessionsTable } from './SessionsTable';
import {
  MAX_RENDERED_SESSIONS,
  SESSIONS_PAGE_SIZE,
} from './ShellSessionsTable';
import { SEARCH_MIN } from '../../lib/toolset';
import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react';

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => 'https://avatars.example/agent.png',
}));

const mockDeleteSession = jest.fn();
jest.mock('../../hooks/useDeleteSession', () => ({
  useDeleteSession: (_installation: string, sessionId: string) => ({
    deleteSession: () => mockDeleteSession(sessionId),
    isDeleting: false,
    isDeleted: false,
    error: null,
    reset: jest.fn(),
  }),
}));

const mockRenameSession = jest.fn();
jest.mock('../../hooks/useRenameSession', () => ({
  useRenameSession: () => ({
    renameSession: mockRenameSession,
    isRenaming: false,
    error: null,
    reset: jest.fn(),
  }),
}));

jest.mock('../../hooks/useKagentCapabilities', () => ({
  useKagentCapabilities: () => ({ isUserScoped: true }),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const now = new Date();
const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
function daysAgo(days: number, hour: number) {
  return new Date(
    startOfToday.getFullYear(),
    startOfToday.getMonth(),
    startOfToday.getDate() - days,
    hour,
  ).toISOString();
}

function session(
  sessionId: string,
  title: string,
  agentName: string,
  createdAt: string | undefined,
): SessionRow {
  return {
    id: `gazelle/${sessionId}`,
    sessionId,
    installation: 'gazelle',
    title,
    agentName,
    agentNamespace: 'agents',
    agentTechnicalName: agentName.toLowerCase().replace(/ /g, '-'),
    createdAt,
  };
}

const rows: SessionRow[] = [
  session(
    'a',
    'Triage this week',
    'Support Triage',
    startOfToday.toISOString(),
  ),
  session('b', 'Release notes', 'Release Writer', daysAgo(1, 12)),
  session('c', 'Pricing research', 'Support Triage', daysAgo(5, 9)),
  session('d', 'Untimed', 'Release Writer', undefined),
];

/**
 * Enough sessions for the search and filters to show (more than SEARCH_MIN):
 * the four above plus older ones whose state was not evaluated, which count
 * only towards "All".
 */
const filterable: SessionRow[] = [
  ...rows,
  ...Array.from({ length: SEARCH_MIN + 1 - rows.length }, (_, index) =>
    session(
      `old${index}`,
      `Archived ${index + 1}`,
      'Support Triage',
      daysAgo(10, index),
    ),
  ),
];
const archivedNewestFirst = Array.from(
  { length: filterable.length - rows.length },
  (_, index) => `Archived ${filterable.length - rows.length - index}`,
);

const states: FleetSessionStatesView = {
  states: new Map<string, SessionStateEntry>([
    ['gazelle/a', { sessionId: 'a', state: 'input-required' }],
    ['gazelle/b', { sessionId: 'b', state: 'working' }],
    ['gazelle/c', { sessionId: 'c', state: 'canceled' }],
    ['gazelle/d', { sessionId: 'd', state: 'rejected' }],
  ]),
  unreadable: new Set(),
  failedInstallations: new Set(),
  skippedCount: 0,
  isLoading: false,
  isError: false,
};

async function renderShell(
  sessionRows: SessionRow[] = rows,
  sessionStates: FleetSessionStatesView = states,
  storage: StorageApi = mockApis.storage(),
  path = '/agent-platform/sessions',
) {
  await renderInTestApp(
    <SessionsTable
      rows={sessionRows}
      sessionStates={sessionStates}
      searchDebounceMs={0}
      showFilters
      layout="shell"
    />,
    {
      apis: [[storageApiRef, storage]],
      initialRouteEntries: [path],
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    },
  );
}

/** A storage bucket pre-seeded with pinned sessions. */
async function storageWithPins(sessionIds: string[]) {
  const storage = mockApis.storage();
  await storage.forBucket('agent-platform').set(
    'pinnedSessions',
    sessionIds.map(sessionId => ({ installation: 'gazelle', sessionId })),
  );
  return storage;
}

const rowTitles = (grid: HTMLElement) =>
  within(grid)
    .getAllByRole('rowheader')
    .map(cell => cell.textContent);

const agentSelect = () =>
  screen
    .getAllByRole('button', { name: /Agent$/ })
    .find(button => button.getAttribute('aria-haspopup') === 'listbox')!;

const chipLabels = () =>
  within(screen.getByRole('radiogroup', { name: 'Filter by state' }))
    .getAllByRole('radio')
    .map(chip => chip.textContent);

describe('SessionsTable in the shell layout', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockDeleteSession.mockClear();
    mockRenameSession.mockClear();
  });

  it('shows one table per day the sessions started, each named by its heading', async () => {
    await renderShell();

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map(heading => heading.textContent);
    expect(headings).toEqual(['Today', 'Yesterday', 'Earlier']);

    expect(rowTitles(screen.getByRole('grid', { name: 'Today' }))).toEqual([
      'Triage this week',
    ]);
    expect(rowTitles(screen.getByRole('grid', { name: 'Yesterday' }))).toEqual([
      'Release notes',
    ]);
    expect(rowTitles(screen.getByRole('grid', { name: 'Earlier' }))).toEqual([
      'Pricing research',
      'Untimed',
    ]);
  });

  it('leaves out a day without sessions', async () => {
    await renderShell([rows[2]]);

    expect(
      screen.queryByRole('grid', { name: 'Today' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('grid', { name: 'Yesterday' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('grid', { name: 'Earlier' })).toBeInTheDocument();
  });

  it('names each state in the shell words', async () => {
    await renderShell();

    const today = screen.getByRole('grid', { name: 'Today' });
    expect(within(today).getByText('Waiting for you')).toBeInTheDocument();
    const earlier = screen.getByRole('grid', { name: 'Earlier' });
    expect(within(earlier).getByText('Finished')).toBeInTheDocument();
    expect(within(earlier).getByText('Failed')).toBeInTheDocument();
  });

  it('colours the state dots by the session-state variables the shell sets', async () => {
    await renderShell();

    const earlier = screen.getByRole('grid', { name: 'Earlier' });
    const finishedDot = within(earlier)
      .getByText('Finished')
      .parentElement?.querySelector<HTMLElement>('[data-tone]');
    const tone = finishedDot?.dataset.tone;
    expect(finishedDot?.style.backgroundColor).toMatch(
      new RegExp(`^var\\(--agent-platform-state-dot-${tone}, var\\(--bui-fg-`),
    );
  });

  it('counts the sessions on each state chip, in the shell words', async () => {
    await renderShell(filterable);

    expect(chipLabels()).toEqual([
      `All ${filterable.length}`,
      'Waiting for you 1',
      'Working 1',
      'Finished 1',
      'Failed 1',
    ]);
  });

  it('shows a chip for sessions with no activity only while there are some', async () => {
    await renderShell(
      [
        ...filterable,
        session('e', 'Never ran', 'Support Triage', daysAgo(3, 9)),
      ],
      {
        ...states,
        states: new Map([
          ...states.states,
          ['gazelle/e', { sessionId: 'e', state: null }],
        ]),
      },
    );

    expect(chipLabels()).toContain('No activity yet 1');
  });

  it('filters every day by state and agent at once', async () => {
    const user = userEvent.setup();
    await renderShell(filterable);

    await user.click(screen.getByRole('radio', { name: 'Working 1' }));
    expect(screen.getAllByRole('grid')).toHaveLength(1);
    expect(rowTitles(screen.getByRole('grid', { name: 'Yesterday' }))).toEqual([
      'Release notes',
    ]);

    await user.click(
      screen.getByRole('radio', { name: `All ${filterable.length}` }),
    );
    await user.click(agentSelect());
    await user.click(
      await screen.findByRole('option', { name: 'Support Triage' }),
    );
    expect(
      screen.getAllByRole('rowheader').map(cell => cell.textContent),
    ).toEqual(['Triage this week', 'Pricing research', ...archivedNewestFirst]);
  });

  it('searches by title or agent', async () => {
    const user = userEvent.setup();
    await renderShell(filterable);

    const search = screen.getByRole('searchbox', { name: 'Search sessions' });
    expect(search).toHaveAttribute('placeholder', 'Search by title or agent');

    await user.type(search, 'release writer');
    expect(
      screen.getAllByRole('rowheader').map(cell => cell.textContent),
    ).toEqual(['Release notes', 'Untimed']);
  });

  it('says what the search did not match, and clears it', async () => {
    const user = userEvent.setup();
    await renderShell(filterable);

    await user.type(
      screen.getByRole('searchbox', { name: 'Search sessions' }),
      'zebra',
    );

    expect(
      await screen.findByText('No sessions match “zebra”'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Clear search and filters' }),
    );
    expect(screen.getAllByRole('grid')).toHaveLength(3);
  });

  it('opens on the chip a link asks for, even under SEARCH_MIN', async () => {
    // The needs-input toast's "Show waiting sessions" (T39).
    await renderShell(
      rows,
      states,
      mockApis.storage(),
      '/agent-platform/sessions?state=waiting',
    );

    expect(screen.getByRole('radio', { name: /^Waiting/ })).toBeChecked();
    expect(
      screen.getAllByRole('rowheader').map(cell => cell.textContent),
    ).toEqual(['Triage this week']);
  });

  it('opens searching for what a link asks for', async () => {
    // The palette's "+N more" on its sessions (T39).
    await renderShell(
      filterable,
      states,
      mockApis.storage(),
      '/agent-platform/sessions?q=release',
    );

    expect(
      screen.getByRole('searchbox', { name: 'Search sessions' }),
    ).toHaveValue('release');
    // Titles and agents, as typed: both of Release Writer's sessions.
    expect(
      screen.getAllByRole('rowheader').map(cell => cell.textContent),
    ).toEqual(['Release notes', 'Untimed']);
  });

  it('ignores a state it does not know', async () => {
    await renderShell(
      filterable,
      states,
      mockApis.storage(),
      '/agent-platform/sessions?state=bogus',
    );

    expect(screen.getByRole('radio', { name: /^All/ })).toBeChecked();
  });

  it('offers no pagination and no sorting', async () => {
    await renderShell();

    expect(
      screen.queryByRole('button', { name: /next page/i }),
    ).not.toBeInTheDocument();
    for (const header of screen.getAllByRole('columnheader')) {
      expect(header).not.toHaveAttribute('aria-sort');
    }
  });

  it('opens a row menu with rename and delete, without opening the session', async () => {
    const user = userEvent.setup();
    await renderShell();

    await user.click(
      screen.getByRole('button', {
        name: 'More actions for “Triage this week”',
      }),
    );

    expect(
      await screen.findByRole('menuitem', { name: 'Rename session…' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Delete session…' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Rename session…' }));
    expect(
      await screen.findByRole('dialog', { name: /Rename/ }),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('opens the row menu from the keyboard without opening the session', async () => {
    const user = userEvent.setup();
    await renderShell();

    screen
      .getByRole('button', { name: 'More actions for “Release notes”' })
      .focus();
    await user.keyboard('{Enter}');

    expect(
      await screen.findByRole('menuitem', { name: 'Rename session…' }),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('labels the agent filter visibly', async () => {
    await renderShell(filterable);

    expect(agentSelect()).toHaveAccessibleName('All agents Agent');
    const label = (agentSelect().getAttribute('aria-labelledby') ?? '')
      .split(' ')
      .map(id => document.getElementById(id))
      .find(element => element?.textContent === 'Agent');
    expect(label).toBeVisible();
  });

  describe('pinned sessions', () => {
    it('surfaces them in a leading Pinned group, out of their day group', async () => {
      await renderShell(rows, states, await storageWithPins(['b']));

      const headings = screen
        .getAllByRole('heading', { level: 2 })
        .map(heading => heading.textContent);
      expect(headings).toEqual(['Pinned', 'Today', 'Earlier']);
      expect(rowTitles(screen.getByRole('grid', { name: 'Pinned' }))).toEqual([
        'Release notes',
      ]);
      // A pinned row can be from any day, so its start shows as a date.
      const pinnedGrid = screen.getByRole('grid', { name: 'Pinned' });
      expect(
        within(pinnedGrid).getByRole('rowheader').closest('[role="row"]'),
      ).toHaveTextContent(/[A-Z][a-z]{2}/);
    });

    it('offers the Pinned chip once something is pinned, and filters by it', async () => {
      const user = userEvent.setup();
      await renderShell(filterable, states, await storageWithPins(['b', 'c']));

      await user.click(screen.getByRole('radio', { name: 'Pinned 2' }));

      expect(
        screen.getAllByRole('rowheader').map(cell => cell.textContent),
      ).toEqual(['Release notes', 'Pricing research']);
      expect(
        screen.queryByRole('grid', { name: 'Today' }),
      ).not.toBeInTheDocument();
    });

    it('pins and unpins a session from its row, without opening it', async () => {
      const user = userEvent.setup();
      const storage = mockApis.storage();
      await renderShell(filterable, states, storage);

      expect(
        screen.queryByRole('radio', { name: /^Pinned/ }),
      ).not.toBeInTheDocument();

      await user.click(
        screen.getByRole('button', { name: 'Pin “Triage this week”' }),
      );

      await waitFor(() =>
        expect(
          storage.forBucket('agent-platform').snapshot('pinnedSessions').value,
        ).toEqual([{ installation: 'gazelle', sessionId: 'a' }]),
      );
      expect(
        rowTitles(await screen.findByRole('grid', { name: 'Pinned' })),
      ).toEqual(['Triage this week']);
      expect(
        screen.getByRole('radio', { name: 'Pinned 1' }),
      ).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();

      await user.click(
        screen.getByRole('button', { name: 'Unpin “Triage this week”' }),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('grid', { name: 'Pinned' }),
        ).not.toBeInTheDocument(),
      );
    });
  });

  describe('a long list', () => {
    const many = Array.from({ length: SESSIONS_PAGE_SIZE + 5 }, (_, index) =>
      session(
        `m${index}`,
        `Session ${index + 1}`,
        'Support Triage',
        new Date(startOfToday.getTime() - index * 60_000).toISOString(),
      ),
    );

    it('shows a page of sessions and the next on Load more', async () => {
      const user = userEvent.setup();
      await renderShell(many);

      expect(screen.getAllByRole('rowheader')).toHaveLength(SESSIONS_PAGE_SIZE);
      expect(
        screen.getByText(
          `Showing ${SESSIONS_PAGE_SIZE} of ${many.length} sessions`,
        ),
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Load more' }));

      expect(screen.getAllByRole('rowheader')).toHaveLength(many.length);
      expect(
        screen.queryByRole('button', { name: 'Load more' }),
      ).not.toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen
            .getByRole('rowheader', {
              name: `Session ${SESSIONS_PAGE_SIZE + 1}`,
            })
            .closest('[role="row"]'),
        ).toContainElement(document.activeElement as HTMLElement),
      );
    });

    it('pages what the search matches, from its first page', async () => {
      const user = userEvent.setup();
      await renderShell(many);
      await user.click(screen.getByRole('button', { name: 'Load more' }));

      await user.type(
        screen.getByRole('searchbox', { name: 'Search sessions' }),
        'Session 2',
      );

      expect(
        screen.getAllByRole('rowheader').map(cell => cell.textContent),
      ).toEqual([
        'Session 2',
        ...Array.from({ length: 10 }, (_, i) => `Session ${20 + i}`),
      ]);
      expect(
        screen.queryByRole('button', { name: 'Load more' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('at 3 sessions and at 300 (T39)', () => {
    const fleetOf = (count: number, agents = 3) =>
      Array.from({ length: count }, (_, index) =>
        session(
          `s${index}`,
          `Session ${index + 1}`,
          `Agent ${index % agents}`,
          new Date(startOfToday.getTime() - index * 60_000).toISOString(),
        ),
      );

    it('lists three sessions bare: no search, no filters, no paging', async () => {
      await renderShell(rows.slice(0, 3));

      expect(screen.getAllByRole('rowheader')).toHaveLength(3);
      expect(
        screen.queryByRole('searchbox', { name: 'Search sessions' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Agent$/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('radiogroup', { name: 'Filter by state' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/Waiting for you \d/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Load more' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/^Showing/)).not.toBeInTheDocument();
    });

    it('offers no agent picker over one agent’s sessions', async () => {
      await renderShell(fleetOf(SEARCH_MIN + 1, 1));

      expect(
        screen.getByRole('searchbox', { name: 'Search sessions' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Agent$/ }),
      ).not.toBeInTheDocument();
    });

    it('keeps 300 sessions to a bounded window, with search and a way back', async () => {
      const user = userEvent.setup();
      const fleet = fleetOf(300);
      await renderShell(fleet);

      expect(
        screen.getByRole('searchbox', { name: 'Search sessions' }),
      ).toBeInTheDocument();
      expect(agentSelect()).toBeInTheDocument();
      expect(screen.getAllByRole('rowheader')).toHaveLength(SESSIONS_PAGE_SIZE);

      // Load more grows the list up to the cap…
      const presses = MAX_RENDERED_SESSIONS / SESSIONS_PAGE_SIZE - 1;
      for (let press = 0; press < presses; press++) {
        await user.click(screen.getByRole('button', { name: 'Load more' }));
      }
      expect(screen.getAllByRole('rowheader')).toHaveLength(
        MAX_RENDERED_SESSIONS,
      );
      expect(
        screen.queryByRole('button', { name: 'Show previous' }),
      ).not.toBeInTheDocument();

      // …and slides past it, rather than mounting all 300.
      await user.click(screen.getByRole('button', { name: 'Load more' }));
      const titles = screen
        .getAllByRole('rowheader')
        .map(cell => cell.textContent);
      expect(titles).toHaveLength(MAX_RENDERED_SESSIONS);
      expect(titles[0]).toBe(`Session ${SESSIONS_PAGE_SIZE + 1}`);
      expect(titles[titles.length - 1]).toBe(
        `Session ${MAX_RENDERED_SESSIONS + SESSIONS_PAGE_SIZE}`,
      );
      expect(
        screen.getByText(`${SESSIONS_PAGE_SIZE} sessions before these`),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          `Showing ${SESSIONS_PAGE_SIZE + 1}–${
            MAX_RENDERED_SESSIONS + SESSIONS_PAGE_SIZE
          } of 300 sessions`,
        ),
      ).toBeInTheDocument();

      // Show previous slides back to the top, still within the cap.
      await user.click(screen.getByRole('button', { name: 'Show previous' }));
      const back = screen
        .getAllByRole('rowheader')
        .map(cell => cell.textContent);
      expect(back).toHaveLength(MAX_RENDERED_SESSIONS);
      expect(back[0]).toBe('Session 1');
      expect(
        screen.queryByRole('button', { name: 'Show previous' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('deleting a session from its row', () => {
    function DeletingList({ initial }: { initial: SessionRow[] }) {
      const [current, setCurrent] = useState(initial);
      mockDeleteSession.mockImplementation(async (sessionId: string) => {
        act(() =>
          setCurrent(list => list.filter(row => row.sessionId !== sessionId)),
        );
      });
      return (
        <SessionsTable
          rows={current}
          sessionStates={states}
          searchDebounceMs={0}
          showFilters
          layout="shell"
        />
      );
    }

    async function deleteRow(title: string) {
      const user = userEvent.setup();
      await user.click(
        screen.getByRole('button', { name: `More actions for “${title}”` }),
      );
      await user.click(
        await screen.findByRole('menuitem', { name: 'Delete session…' }),
      );
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /Delete/ }));
    }

    it('moves focus to the next row', async () => {
      await renderInTestApp(<DeletingList initial={rows} />, {
        mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
      });

      await deleteRow('Release notes');

      await waitFor(() =>
        expect(
          screen
            .getByRole('rowheader', { name: 'Pricing research' })
            .closest('[role="row"]'),
        ).toContainElement(document.activeElement as HTMLElement),
      );
      expect(mockDeleteSession).toHaveBeenCalledWith('b');
    });

    it('moves focus to the row before when the last row goes', async () => {
      await renderInTestApp(<DeletingList initial={rows} />, {
        mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
      });

      await deleteRow('Untimed');

      await waitFor(() =>
        expect(
          screen
            .getByRole('rowheader', { name: 'Pricing research' })
            .closest('[role="row"]'),
        ).toContainElement(document.activeElement as HTMLElement),
      );
    });
  });

  it('opens the session from anywhere else on its row', async () => {
    const user = userEvent.setup();
    await renderShell();

    await user.click(
      within(screen.getByRole('grid', { name: 'Yesterday' })).getByText(
        'Release Writer',
      ),
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/sessions/gazelle/b',
    );
  });

  describe('at phone width (T22 B1)', () => {
    let layout: MockedLayout;
    afterEach(() => layout.restore());

    /** The stacked list named by a day's heading. */
    const dayList = (name: string) => screen.getByRole('list', { name });
    const listTitles = (list: HTMLElement) =>
      within(list)
        .getAllByRole('listitem')
        .map(item => within(item).getAllByRole('link')[0].textContent);

    it('lists each day as stacked rows instead of a table', async () => {
      layout = mockPhoneLayout();
      await renderShell();

      expect(screen.queryByRole('grid')).not.toBeInTheDocument();
      expect(listTitles(dayList('Today'))).toEqual(['Triage this week']);
      expect(listTitles(dayList('Yesterday'))).toEqual(['Release notes']);
      expect(listTitles(dayList('Earlier'))).toEqual([
        'Pricing research',
        'Untimed',
      ]);
    });

    it('links the title to the session and puts agent, state, environment and start under it', async () => {
      layout = mockPhoneLayout();
      await renderShell();

      const today = dayList('Today');
      expect(
        within(today).getByRole('link', { name: 'Triage this week' }),
      ).toHaveAttribute('href', '/agent-platform/sessions/gazelle/a');
      const row = within(today).getByRole('listitem');
      expect(within(row).getByText('Support Triage')).toBeInTheDocument();
      expect(within(row).getByText('Waiting for you')).toBeInTheDocument();
      expect(within(row).getByText('gazelle')).toBeInTheDocument();
      expect(row.querySelector('time')).toHaveAttribute(
        'dateTime',
        rows[0].createdAt,
      );
    });

    it('keeps the pin and the ⋯ menu on the row, pressable without opening it', async () => {
      layout = mockPhoneLayout();
      const user = userEvent.setup();
      const storage = mockApis.storage();
      await renderShell(rows, states, storage);

      const row = within(dayList('Yesterday')).getByRole('listitem');
      await user.click(
        within(row).getByRole('button', { name: 'Pin “Release notes”' }),
      );
      await waitFor(() =>
        expect(listTitles(dayList('Pinned'))).toEqual(['Release notes']),
      );

      await user.click(
        screen.getByRole('button', {
          name: 'More actions for “Release notes”',
        }),
      );
      expect(
        await screen.findByRole('menuitem', { name: 'Delete session…' }),
      ).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('says a missing state in words that stand without a column', async () => {
      layout = mockPhoneLayout();
      await renderShell(
        [session('x', 'Never read', 'Support Triage', daysAgo(2, 9))],
        { ...states, states: new Map() },
      );

      expect(
        within(dayList('Earlier')).getByText('State not loaded'),
      ).toBeInTheDocument();
    });

    it('goes back to the tables when the window widens', async () => {
      layout = mockPhoneLayout();
      await renderShell();
      expect(screen.queryByRole('grid')).not.toBeInTheDocument();

      act(() => layout.setWidth(1280));

      expect(
        await screen.findByRole('grid', { name: 'Today' }),
      ).toBeInTheDocument();
    });

    it('keeps the tables on a desktop', async () => {
      layout = mockDesktopLayout();
      await renderShell();

      expect(screen.getByRole('grid', { name: 'Today' })).toBeInTheDocument();
      expect(
        screen.queryByRole('list', { name: 'Today' }),
      ).not.toBeInTheDocument();
    });
  });
});
