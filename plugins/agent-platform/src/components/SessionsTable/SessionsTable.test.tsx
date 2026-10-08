import { renderInTestApp } from '@backstage/frontend-test-utils';
import { useState } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionStateEntry } from '@giantswarm/backstage-plugin-agent-platform-common';
import { FleetSessionStatesView } from '../../hooks/useFleetSessionStates';
import { SessionRow } from '../SessionsDataProvider/helpers';
import { sessionsRouteRef } from '../../routes';
import { SessionsTable } from './SessionsTable';

const mockBuildAvatarUrl = jest.fn(
  (installation: string, name: string) =>
    `https://avatars.${installation}.example/v1/48/${name}.png`,
);

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => mockBuildAvatarUrl,
}));

// The row's programmatic navigation, and *only* it: `Link` resolves `useNavigate`
// internally within react-router-dom, so its own client-side navigation is
// untouched by this mock. A call here therefore means the row handler ran.
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const rows: SessionRow[] = [
  {
    id: 'gazelle/abc',
    sessionId: 'abc',
    installation: 'gazelle',
    title: 'What issues are assi...',
    agentName: 'Issue tracker',
    agentTechnicalName: 'issue-tracker',
    createdAt: '2026-07-23T16:04:28.586641Z',
  },
  {
    id: 'golem/def',
    sessionId: 'def',
    installation: 'golem',
    title: 'Chat',
    agentName: '',
    createdAt: undefined,
  },
];

describe('SessionsTable', () => {
  beforeEach(() => {
    mockBuildAvatarUrl.mockClear();
    mockNavigate.mockClear();
  });

  it('renders every column header', async () => {
    await renderInTestApp(<SessionsTable rows={rows} />, {
      // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
      // SubRouteRef — and the detail sub-route resolves relative to it.
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    });

    for (const header of ['Session', 'Agent', 'Installation', 'Started']) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
    // kagent API v2 does not move updated_at on a turn (kagent-dev/kagent#2397).
    expect(screen.queryByText('Last activity')).not.toBeInTheDocument();
  });

  it('links each row to its session, carrying both installation and id', async () => {
    // A real anchor, not only a row click: an anchor is what makes cmd- and
    // middle-click open a new tab and gives keyboard users something focusable.
    // Both path segments are needed because kagent ids are only unique within an
    // installation.
    await renderInTestApp(<SessionsTable rows={rows} />, {
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    });

    expect(
      screen.getByRole('link', { name: 'What issues are assi...' }),
    ).toHaveAttribute('href', '/agent-platform/sessions/gazelle/abc');
    expect(screen.getByRole('link', { name: 'Chat' })).toHaveAttribute(
      'href',
      '/agent-platform/sessions/golem/def',
    );
  });

  describe('navigation', () => {
    // The row's onClick is react-aria's `onAction`, which fires for a press
    // anywhere in the row — the anchor included. Both firing for one click
    // navigated twice: two identical history entries, so Back needed two presses,
    // and with a modifier held the session opened in a new tab *and* took the
    // current one with it.
    it('does not also navigate the row when the title link is clicked', async () => {
      await renderInTestApp(<SessionsTable rows={rows} />, {
        mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
      });

      await userEvent.click(
        screen.getByRole('link', { name: 'What issues are assi...' }),
      );

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('still navigates the row when a modifier key is held on the link', async () => {
      // The browser opens the anchor in a new tab and react-router stays out of
      // the way; the row must stay out of the way too, or the current tab is
      // navigated away from the list the user wanted to keep.
      await renderInTestApp(<SessionsTable rows={rows} />, {
        mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
      });

      await userEvent.keyboard('{Meta>}');
      await userEvent.click(
        screen.getByRole('link', { name: 'What issues are assi...' }),
      );
      await userEvent.keyboard('{/Meta}');

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('navigates when a cell other than the title is clicked', async () => {
      // The whole-row click is the convenience affordance and must keep working.
      await renderInTestApp(<SessionsTable rows={rows} />, {
        mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
      });

      await userEvent.click(screen.getByText('Issue tracker'));

      expect(mockNavigate).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith(
        '/agent-platform/sessions/gazelle/abc',
      );
    });
  });

  it('renders session titles as kagent supplied them', async () => {
    await renderInTestApp(<SessionsTable rows={rows} />, {
      // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
      // SubRouteRef — and the detail sub-route resolves relative to it.
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    });

    // kagent truncates to 20 chars, so the ellipsis is real data, not ours.
    expect(screen.getByText('What issues are assi...')).toBeInTheDocument();
    // The fallback for a session kagent never titled.
    expect(screen.getByText('Chat')).toBeInTheDocument();
  });

  it('seeds the avatar from the resolved agent’s technical name', async () => {
    await renderInTestApp(<SessionsTable rows={rows} />, {
      // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
      // SubRouteRef — and the detail sub-route resolves relative to it.
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    });

    expect(mockBuildAvatarUrl).toHaveBeenCalledWith(
      'gazelle',
      'issue-tracker',
      {
        size: 48,
      },
    );
  });

  it('shows a dash where a value is unknown', async () => {
    await renderInTestApp(<SessionsTable rows={[rows[1]]} />, {
      // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
      // SubRouteRef — and the detail sub-route resolves relative to it.
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    });

    // Missing agent, missing start: two dashes. Explicit because DateComponent
    // renders null for a falsy value, which would leave the cell blank.
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  it('renders the empty state when there are no rows', async () => {
    await renderInTestApp(<SessionsTable rows={[]} />, {
      // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
      // SubRouteRef — and the detail sub-route resolves relative to it.
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    });

    expect(screen.getByText('No sessions found.')).toBeInTheDocument();
  });

  it('shows a skeleton rather than the empty state while loading', async () => {
    // The `data={undefined}` gotcha: passing `[]` would render "No sessions
    // found." before the first rows arrive.
    await renderInTestApp(<SessionsTable rows={[]} isLoading />, {
      // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
      // SubRouteRef — and the detail sub-route resolves relative to it.
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    });

    expect(screen.queryByText('No sessions found.')).not.toBeInTheDocument();
  });

  describe('search', () => {
    // The search itself still matches a hidden column's value — it finds more
    // than it offers, which is harmless — but a list scoped to one agent on one
    // installation must not advertise those as ways to search it.
    it.each([
      [undefined, 'Search by session, agent, or installation'],
      [['agentName'] as const, 'Search by session or installation'],
      [['agentName', 'installation'] as const, 'Search by session'],
    ])(
      'names only the visible axes (hiding %s)',
      async (hidden, placeholder) => {
        await renderInTestApp(
          <SessionsTable rows={rows} hideColumns={hidden} />,
          {
            mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
          },
        );

        expect(
          screen.getByRole('searchbox', { name: 'Search sessions' }),
        ).toHaveAttribute('placeholder', placeholder);
      },
    );

    it('filters by session title', async () => {
      await renderInTestApp(
        <SessionsTable rows={rows} searchDebounceMs={0} />,
        {
          // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
          // SubRouteRef — and the detail sub-route resolves relative to it.
          mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
        },
      );

      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search sessions' }),
        'issues',
      );

      expect(screen.getByText('What issues are assi...')).toBeInTheDocument();
      expect(screen.queryByText('Chat')).not.toBeInTheDocument();
    });

    it('filters by agent name', async () => {
      await renderInTestApp(
        <SessionsTable rows={rows} searchDebounceMs={0} />,
        {
          // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
          // SubRouteRef — and the detail sub-route resolves relative to it.
          mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
        },
      );

      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search sessions' }),
        'tracker',
      );

      expect(screen.getByText('What issues are assi...')).toBeInTheDocument();
      expect(screen.queryByText('Chat')).not.toBeInTheDocument();
    });

    it('names the search term when nothing matches', async () => {
      await renderInTestApp(
        <SessionsTable rows={rows} searchDebounceMs={0} />,
        {
          // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
          // SubRouteRef — and the detail sub-route resolves relative to it.
          mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
        },
      );

      await userEvent.type(
        screen.getByRole('searchbox', { name: 'Search sessions' }),
        'nothing matches this',
      );

      expect(
        await screen.findByText('No sessions match "nothing matches this".'),
      ).toBeInTheDocument();
    });
  });
});

describe('SessionsTable — a session whose runtime kagent reports lost', () => {
  it('marks the row, so the person knows before they open it and type', async () => {
    await renderInTestApp(
      <SessionsTable
        rows={[
          { ...rows[0], runtimeLost: true },
          { ...rows[1], id: 'golem/ghi', sessionId: 'ghi' },
        ]}
      />,
      { mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef } },
    );

    const marks = screen.getAllByText('Runtime lost');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveAttribute(
      'title',
      expect.stringContaining('Start a new session'),
    );
    // Beside the title of the row it belongs to.
    expect(
      screen.getByRole('rowheader', { name: /What issues are assi/ }),
    ).toHaveTextContent('Runtime lost');
  });
});

describe('SessionsTable — the State column', () => {
  function statesView(
    overrides: Partial<FleetSessionStatesView> = {},
  ): FleetSessionStatesView {
    return {
      states: new Map<string, SessionStateEntry>(),
      unreadable: new Set<string>(),
      failedInstallations: new Set<string>(),
      skippedCount: 0,
      isLoading: false,
      isError: false,
      ...overrides,
    };
  }

  it('is left out entirely when the caller loads no states', async () => {
    // A column of dashes is worse than no column: it implies the answer is
    // unknown when in fact nobody asked.
    await renderInTestApp(<SessionsTable rows={rows} />, {
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    });

    expect(screen.queryByText('State')).not.toBeInTheDocument();
  });

  it('names the state of each row in the same words the session page uses', async () => {
    await renderInTestApp(
      <SessionsTable
        rows={rows}
        sessionStates={statesView({
          states: new Map<string, SessionStateEntry>([
            ['gazelle/abc', { sessionId: 'abc', state: 'input-required' }],
            ['golem/def', { sessionId: 'def', state: 'completed' }],
          ]),
        })}
      />,
      { mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef } },
    );

    expect(screen.getByText('State')).toBeInTheDocument();
    expect(screen.getByText('Waiting for input')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('says a session it could not read is unknown, never that it is finished', async () => {
    await renderInTestApp(
      <SessionsTable
        rows={rows}
        sessionStates={statesView({ unreadable: new Set(['gazelle/abc']) })}
      />,
      { mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef } },
    );

    expect(screen.getByText('Unknown')).toHaveAttribute(
      'title',
      expect.stringContaining('not the same as finished'),
    );
  });

  it('distinguishes a session that has never run from one nobody asked about', async () => {
    await renderInTestApp(
      <SessionsTable
        rows={rows}
        sessionStates={statesView({
          states: new Map<string, SessionStateEntry>([
            ['gazelle/abc', { sessionId: 'abc', state: null }],
          ]),
        })}
      />,
      { mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef } },
    );

    expect(screen.getByText('No activity yet')).toBeInTheDocument();
    // The second row was never evaluated, so its cell says so in words rather
    // than a bare dash, and points at where the state is.
    expect(screen.getByText('Not loaded')).toHaveAttribute(
      'title',
      'Open the session to see its state.',
    );
  });

  it('sorts what needs a person to the top', async () => {
    const user = userEvent.setup();
    await renderInTestApp(
      <SessionsTable
        rows={rows}
        sessionStates={statesView({
          states: new Map<string, SessionStateEntry>([
            ['gazelle/abc', { sessionId: 'abc', state: 'completed' }],
            ['golem/def', { sessionId: 'def', state: 'input-required' }],
          ]),
        })}
      />,
      { mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef } },
    );

    await user.click(screen.getByRole('columnheader', { name: /State/ }));

    const cells = screen.getAllByRole('rowheader');
    expect(cells[0]).toHaveTextContent('Chat');
  });
});

describe('SessionsTable — filters', () => {
  const filterRows: SessionRow[] = [
    ['a', 'issue-tracker', 'Issue tracker', 'Triage the backlog'],
    ['b', 'issue-tracker', 'Issue tracker', 'Close stale issues'],
    ['c', 'sre-agent', 'SRE Agent', 'Why is gazelle paging'],
    ['d', 'sre-agent', 'SRE Agent', 'Restart the ingress'],
    ['e', 'sre-agent', 'SRE Agent', 'Rotate the certificate'],
  ].map(([id, technicalName, agentName, title]) => ({
    id: `gazelle/${id}`,
    sessionId: id,
    installation: 'gazelle',
    title,
    agentName,
    agentNamespace: 'agents',
    agentTechnicalName: technicalName,
  }));

  const filterStates: FleetSessionStatesView = {
    states: new Map<string, SessionStateEntry>([
      ['gazelle/a', { sessionId: 'a', state: 'input-required' }],
      ['gazelle/b', { sessionId: 'b', state: 'completed' }],
      ['gazelle/c', { sessionId: 'c', state: 'input-required' }],
      ['gazelle/d', { sessionId: 'd', state: 'failed' }],
    ]),
    unreadable: new Set<string>(['gazelle/e']),
    failedInstallations: new Set<string>(),
    skippedCount: 0,
    isLoading: false,
    isError: false,
  };

  function Swappable({ showFilters }: { showFilters: boolean }) {
    const [shown, setShown] = useState(filterRows);
    return (
      <>
        <button
          type="button"
          onClick={() =>
            setShown(filterRows.filter(r => r.agentName !== 'SRE Agent'))
          }
        >
          Drop the SRE sessions
        </button>
        <SessionsTable
          rows={shown}
          sessionStates={filterStates}
          searchDebounceMs={0}
          showFilters={showFilters}
        />
      </>
    );
  }

  async function renderFiltered(showFilters = true) {
    await renderInTestApp(<Swappable showFilters={showFilters} />, {
      mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
    });
  }

  const titles = () =>
    screen.getAllByRole('rowheader').map(cell => cell.textContent);

  const chipLabels = () =>
    within(screen.getByRole('radiogroup', { name: 'Filter by state' }))
      .getAllByRole('radio')
      .map(chip => chip.textContent);

  async function pickAgent(
    user: ReturnType<typeof userEvent.setup>,
    name: string,
  ) {
    await user.click(screen.getByRole('button', { name: /Filter by agent/ }));
    await user.click(await screen.findByRole('option', { name }));
  }

  it('is left out unless the caller asks for it', async () => {
    await renderFiltered(false);

    expect(
      screen.queryByRole('radiogroup', { name: 'Filter by state' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Filter by agent')).not.toBeInTheDocument();
  });

  it('counts the loaded rows on each state chip', async () => {
    await renderFiltered();

    expect(chipLabels()).toEqual([
      'All 5',
      'Waiting for input 2',
      'Working 0',
      'Failed 1',
      'Completed 1',
      'No activity yet 0',
      'Unknown 1',
    ]);
  });

  it('counts only the rows the search matched', async () => {
    const user = userEvent.setup();
    await renderFiltered();

    await user.type(
      screen.getByRole('searchbox', { name: 'Search sessions' }),
      'the',
    );

    expect(await screen.findByRole('radio', { name: 'All 3' })).toBeVisible();
    expect(chipLabels()).toEqual([
      'All 3',
      'Waiting for input 1',
      'Working 0',
      'Failed 1',
      'Completed 0',
      'No activity yet 0',
      'Unknown 1',
    ]);
  });

  it('shows only the rows of the picked state', async () => {
    const user = userEvent.setup();
    await renderFiltered();

    await user.click(
      screen.getByRole('radio', { name: 'Waiting for input 2' }),
    );

    expect([...titles()].sort()).toEqual([
      'Triage the backlog',
      'Why is gazelle paging',
    ]);
  });

  it('reaches an unreadable session through the Unknown chip', async () => {
    const user = userEvent.setup();
    await renderFiltered();

    await user.click(screen.getByRole('radio', { name: 'Unknown 1' }));

    expect(titles()).toEqual(['Rotate the certificate']);
  });

  it('narrows to one agent and recounts the chips for it', async () => {
    const user = userEvent.setup();
    await renderFiltered();

    await pickAgent(user, 'SRE Agent');

    expect(titles()).toHaveLength(3);
    expect(chipLabels()).toEqual([
      'All 3',
      'Waiting for input 1',
      'Working 0',
      'Failed 1',
      'Completed 0',
      'No activity yet 0',
      'Unknown 1',
    ]);

    await user.click(screen.getByRole('radio', { name: 'Failed 1' }));

    expect(titles()).toEqual(['Restart the ingress']);
  });

  it('lets go of a picked agent whose sessions are gone', async () => {
    const user = userEvent.setup();
    await renderFiltered();

    await pickAgent(user, 'SRE Agent');
    expect(titles()).toHaveLength(3);

    await user.click(
      screen.getByRole('button', { name: 'Drop the SRE sessions' }),
    );

    expect([...titles()].sort()).toEqual([
      'Close stale issues',
      'Triage the backlog',
    ]);
    expect(
      screen.getByRole('button', { name: /Filter by agent/ }),
    ).toHaveTextContent('All agents');
  });

  it('says when the filters leave nothing', async () => {
    const user = userEvent.setup();
    await renderFiltered();

    await user.click(screen.getByRole('radio', { name: 'Working 0' }));

    expect(
      screen.getByText('No sessions match the filters.'),
    ).toBeInTheDocument();
  });
});
