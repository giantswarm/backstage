import { renderInTestApp } from '@backstage/frontend-test-utils';
import { act, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { SessionStateEntry } from '@giantswarm/backstage-plugin-agent-platform-common';
import { FleetSessionStatesView } from '../../hooks/useFleetSessionStates';
import { SessionRow } from '../SessionsDataProvider/helpers';
import { sessionsRouteRef } from '../../routes';
import { SessionsTable } from './SessionsTable';
import { SESSIONS_PAGE_SIZE } from './ShellSessionsTable';

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
) {
  await renderInTestApp(
    <SessionsTable
      rows={sessionRows}
      sessionStates={sessionStates}
      searchDebounceMs={0}
      showFilters
      layout="shell"
    />,
    { mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef } },
  );
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
    await renderShell();

    expect(chipLabels()).toEqual([
      'All 4',
      'Waiting for you 1',
      'Working 1',
      'Finished 1',
      'Failed 1',
    ]);
  });

  it('shows a chip for sessions with no activity only while there are some', async () => {
    await renderShell(
      [...rows, session('e', 'Never ran', 'Support Triage', daysAgo(3, 9))],
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
    await renderShell();

    await user.click(screen.getByRole('radio', { name: 'Working 1' }));
    expect(screen.getAllByRole('grid')).toHaveLength(1);
    expect(rowTitles(screen.getByRole('grid', { name: 'Yesterday' }))).toEqual([
      'Release notes',
    ]);

    await user.click(screen.getByRole('radio', { name: 'All 4' }));
    await user.click(agentSelect());
    await user.click(
      await screen.findByRole('option', { name: 'Support Triage' }),
    );
    expect(
      screen.getAllByRole('rowheader').map(cell => cell.textContent),
    ).toEqual(['Triage this week', 'Pricing research']);
  });

  it('searches by title or agent', async () => {
    const user = userEvent.setup();
    await renderShell();

    const search = screen.getByRole('searchbox', { name: 'Search sessions' });
    expect(search).toHaveAttribute('placeholder', 'Search by title or agent');

    await user.type(search, 'release writer');
    expect(
      screen.getAllByRole('rowheader').map(cell => cell.textContent),
    ).toEqual(['Release notes', 'Untimed']);
  });

  it('says what the search did not match, and clears it', async () => {
    const user = userEvent.setup();
    await renderShell();

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
    await renderShell();

    expect(agentSelect()).toHaveAccessibleName('All agents Agent');
    const label = (agentSelect().getAttribute('aria-labelledby') ?? '')
      .split(' ')
      .map(id => document.getElementById(id))
      .find(element => element?.textContent === 'Agent');
    expect(label).toBeVisible();
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
});
