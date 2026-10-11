import type { ReactNode } from 'react';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { StorageApi, storageApiRef } from '@backstage/core-plugin-api';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KagentSession } from '@giantswarm/backstage-plugin-agent-platform-common';
import { TOUCH_QUERY } from '@giantswarm/backstage-plugin-ui-react';
import { kagentApiRef } from '../../apis';
import { KagentApi } from '../../apis/types';
import { sessionsRouteRef } from '../../routes';
import { RecentSessions } from './RecentSessions';
import {
  lastActiveAt,
  MAX_RAIL_PINS,
  pickRecentSessions,
  railSessionGroup,
} from './helpers';
import type { SessionRow } from '../SessionsDataProvider';

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

function renderRecent(
  options: {
    mounted?: boolean;
    path?: string;
    shellRail?: boolean;
    limit?: number;
    storage?: StorageApi;
  } = {},
) {
  const {
    mounted = true,
    path = '/',
    shellRail,
    limit = 2,
    storage = mockApis.storage(),
  } = options;
  return renderInTestApp(
    <RecentSessions limit={limit} shellRail={shellRail} />,
    {
      apis: [
        [kagentApiRef, kagentApi],
        [storageApiRef, storage],
      ],
      initialRouteEntries: [path],
      ...(mounted && {
        mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
      }),
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

beforeEach(() => {
  mockQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  listSessions.mockReset();
  listSessionStates.mockReset();
  listInstallations.mockClear();
  listSessions.mockResolvedValue([
    session('old', '2026-07-20T10:00:00Z', 'Oldest'),
    session('new', '2026-07-23T10:00:00Z', 'Newest'),
    session('mid', '2026-07-22T10:00:00Z', 'Middle'),
  ]);
  listSessionStates.mockResolvedValue({
    evaluatedAt: 0,
    states: [
      { sessionId: 'mid', state: 'input-required' },
      { sessionId: 'new', state: 'working' },
    ],
    unreadable: [],
    skipped: 0,
  });
});

describe('RecentSessions', () => {
  it('lists the most recently started sessions, newest first, linked to their detail page', async () => {
    await renderRecent();

    const list = await screen.findByRole('list', { name: 'Recent' });
    const links = await within(list).findAllByRole('link');
    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/agent-platform/sessions/gazelle/new',
      '/agent-platform/sessions/gazelle/mid',
    ]);
    expect(within(list).queryByText('Oldest')).not.toBeInTheDocument();
  });

  it('labels the list without a heading of its own', async () => {
    await renderRecent();

    expect(await screen.findByRole('list', { name: 'Recent' })).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Recent' }),
    ).not.toBeInTheDocument();
  });

  it('marks the sessions waiting for input with a dot that says so on hover', async () => {
    await renderRecent();

    const middle = (await screen.findByText('Middle')).closest('a');
    expect(middle).not.toBeNull();
    const dot = await within(middle as HTMLElement).findByRole('img', {
      name: 'Needs your input',
    });
    // The dot carries no visible text, so the tooltip is how a pointer learns
    // what it means; the accessible name above is how a screen reader does.
    expect(dot).toHaveAttribute('title', 'Needs your input');
    // The pill it replaces is gone.
    expect(screen.queryByText('Needs you')).not.toBeInTheDocument();
    const newest = screen.getByText('Newest').closest('a') as HTMLElement;
    expect(
      within(newest).queryByRole('img', { name: 'Needs your input' }),
    ).not.toBeInTheDocument();
  });

  it('marks the session open at the current location', async () => {
    await renderRecent({ path: '/agent-platform/sessions/gazelle/mid' });

    const middle = (await screen.findByText('Middle')).closest('a');
    expect(middle).toHaveAttribute('aria-current', 'page');
    const newest = screen.getByText('Newest').closest('a');
    expect(newest).not.toHaveAttribute('aria-current');
  });

  it('has no All sessions link and no working dot outside the shell rail', async () => {
    await renderRecent();

    await screen.findByText('Middle');
    expect(
      screen.queryByRole('link', { name: 'All sessions' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Working' }),
    ).not.toBeInTheDocument();
  });

  describe('in the shell rail', () => {
    it('at 3 sessions lists them all, closed by a plain All sessions link (T91)', async () => {
      await renderRecent({ shellRail: true, limit: 8 });

      await screen.findByText('Oldest');
      expect(screen.getByText('Middle')).toBeInTheDocument();
      expect(screen.getByText('Newest')).toBeInTheDocument();
      // No cutoff, so no count: the link is only the way to the full list.
      expect(screen.queryByText(/ more$/)).not.toBeInTheDocument();
      const link = screen.getByRole('link', { name: 'All sessions' });
      expect(link).toHaveAttribute('href', '/agent-platform/sessions');
      expect(link).not.toHaveAttribute('aria-current');
      // After the last session, not on a heading.
      const sessionLinks = screen
        .getAllByRole('link')
        .filter(element => element !== link);
      expect(
        sessionLinks.every(
          element =>
            element.compareDocumentPosition(link) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ).toBe(true);
    });

    it('at 300 sessions lists the cutoff and says how many more All sessions has (T91)', async () => {
      const base = Date.parse('2026-07-01T00:00:00Z');
      listSessions.mockResolvedValue(
        Array.from({ length: 300 }, (_, index) =>
          session(
            `s${index}`,
            new Date(base + index * 60_000).toISOString(),
            `Session ${index}`,
          ),
        ),
      );
      listSessionStates.mockResolvedValue({
        evaluatedAt: 0,
        states: [],
        unreadable: [],
        skipped: 0,
      });

      await renderRecent({ shellRail: true, limit: 8 });

      await screen.findByText('Session 299');
      // Bounded: the cutoff's rows and the link, nothing else.
      const rows = screen
        .getAllByRole('listitem')
        .map(item => within(item).getByRole('link').textContent);
      expect(rows).toHaveLength(8);
      expect(rows[0]).toContain('Session 299');
      expect(rows[7]).toContain('Session 292');
      expect(
        screen.getByRole('link', { name: 'All sessions' }),
      ).toHaveAttribute('href', '/agent-platform/sessions');
      expect(screen.getByText('292 more')).toBeInTheDocument();
    });

    it('orders by last activity: a session continued today leads, under Today (T91)', async () => {
      const now = Date.now();
      const daysAgo = (days: number) =>
        new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
      listSessions.mockResolvedValue([
        session('started', daysAgo(1), 'Started yesterday'),
        session('continued', daysAgo(5), 'Continued today'),
        session('idle', daysAgo(3), 'Untouched'),
      ]);
      listSessionStates.mockResolvedValue({
        evaluatedAt: 0,
        states: [
          // Its newest turn finished a minute ago.
          {
            sessionId: 'continued',
            state: 'completed',
            changedAt: now - 60_000,
          },
        ],
        unreadable: [],
        skipped: 0,
      });

      await renderRecent({ shellRail: true, limit: 2 });

      const today = await screen.findByRole('list', { name: 'Today' });
      expect(
        await within(today).findByText('Continued today'),
      ).toBeInTheDocument();
      const week = screen.getByRole('list', { name: 'Previous 7 days' });
      expect(within(week).getByText('Started yesterday')).toBeInTheDocument();
      // Past the cutoff of two.
      expect(screen.queryByText('Untouched')).not.toBeInTheDocument();
      expect(screen.getByText('1 more')).toBeInTheDocument();
    });

    it('marks All sessions current on the sessions list', async () => {
      await renderRecent({
        shellRail: true,
        limit: 8,
        path: '/agent-platform/sessions',
      });

      expect(
        await screen.findByRole('link', { name: 'All sessions' }),
      ).toHaveAttribute('aria-current', 'page');
    });

    it('puts a dot before the sessions whose agent is working', async () => {
      await renderRecent({ shellRail: true });

      const newest = (await screen.findByText('Newest')).closest(
        'a',
      ) as HTMLElement;
      const workingDot = await within(newest).findByRole('img', {
        name: 'Working',
      });
      expect(workingDot).toHaveAttribute('title', 'Working');
      const middle = screen.getByText('Middle').closest('a') as HTMLElement;
      expect(
        within(middle).queryByRole('img', { name: 'Working' }),
      ).not.toBeInTheDocument();
      expect(
        within(middle).getByRole('img', { name: 'Needs your input' }),
      ).toBeInTheDocument();
    });

    it('groups the sessions under the prototype’s time headings', async () => {
      const now = Date.now();
      const daysAgo = (days: number) =>
        new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
      listSessions.mockResolvedValue([
        session('t', new Date(now).toISOString(), 'Fresh'),
        session('w', daysAgo(3), 'This week'),
        session('e', daysAgo(20), 'Long ago'),
      ]);

      await renderRecent({ shellRail: true, limit: 8 });

      const today = await screen.findByRole('list', { name: 'Today' });
      expect(within(today).getByText('Fresh')).toBeInTheDocument();
      const week = screen.getByRole('list', { name: 'Previous 7 days' });
      expect(within(week).getByText('This week')).toBeInTheDocument();
      const earlier = screen.getByRole('list', { name: 'Earlier' });
      expect(within(earlier).getByText('Long ago')).toBeInTheDocument();
    });

    it('leads with the pinned sessions, without repeating them below', async () => {
      await renderRecent({
        shellRail: true,
        limit: 8,
        storage: await storageWithPins(['old']),
      });

      const pinned = await screen.findByRole('list', { name: 'Pinned' });
      expect(within(pinned).getByText('Oldest')).toBeInTheDocument();
      // Only once: the pinned session does not repeat in the time groups.
      expect(screen.getAllByText('Oldest')).toHaveLength(1);
      expect(screen.getByText('Newest')).toBeInTheDocument();
    });

    it('lists the latest pins up to the cap and links the rest (T39)', async () => {
      const many = Array.from({ length: MAX_RAIL_PINS + 3 }, (_, index) =>
        session(`p${index}`, '2026-07-21T10:00:00Z', `Pinned ${index}`),
      );
      listSessions.mockResolvedValue(many);

      await renderRecent({
        shellRail: true,
        storage: await storageWithPins(many.map(row => row.sessionId)),
      });

      const pinned = await screen.findByRole('list', { name: 'Pinned' });
      expect(within(pinned).getAllByRole('listitem')).toHaveLength(
        MAX_RAIL_PINS,
      );
      // The newest pins stay; the three pinned first are a click away.
      expect(within(pinned).queryByText('Pinned 0')).not.toBeInTheDocument();
      expect(
        within(pinned).getByText(`Pinned ${MAX_RAIL_PINS + 2}`),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: '3 more pinned' }),
      ).toHaveAttribute('href', '/agent-platform/sessions?state=pinned');
    });

    it('has no overflow link while the pins fit', async () => {
      await renderRecent({
        shellRail: true,
        storage: await storageWithPins(['old']),
      });

      await screen.findByRole('list', { name: 'Pinned' });
      expect(
        screen.queryByRole('link', { name: /more pinned$/ }),
      ).not.toBeInTheDocument();
    });

    it('shows the pinned sessions’ status like any other row', async () => {
      listSessionStates.mockResolvedValue({
        evaluatedAt: 0,
        states: [{ sessionId: 'old', state: 'input-required' }],
        unreadable: [],
        skipped: 0,
      });

      await renderRecent({
        shellRail: true,
        storage: await storageWithPins(['old']),
      });

      const pinned = await screen.findByRole('list', { name: 'Pinned' });
      const row = (await within(pinned).findByText('Oldest')).closest(
        'a',
      ) as HTMLElement;
      expect(
        await within(row).findByRole('img', { name: 'Needs your input' }),
      ).toBeInTheDocument();
    });

    it('pins and unpins a session from its row', async () => {
      const user = userEvent.setup();
      const storage = mockApis.storage();
      await renderRecent({ shellRail: true, storage });

      await screen.findByText('Newest');
      await user.click(screen.getByRole('button', { name: 'Pin “Newest”' }));

      await waitFor(() =>
        expect(
          storage.forBucket('agent-platform').snapshot('pinnedSessions').value,
        ).toEqual([{ installation: 'gazelle', sessionId: 'new' }]),
      );
      const pinned = await screen.findByRole('list', { name: 'Pinned' });
      expect(within(pinned).getByText('Newest')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Unpin “Newest”' }));
      await waitFor(() =>
        expect(
          screen.queryByRole('list', { name: 'Pinned' }),
        ).not.toBeInTheDocument(),
      );
    });

    // T22 P10: the pin shows on hover, and a touch screen has none — a
    // tablet's rail must still be able to pin. jsdom applies no media rule to
    // computed styles, so this reads the rule the row's pin slot carries.
    it('keeps every row’s pin visible on a touch screen', async () => {
      await renderRecent({ shellRail: true });

      await screen.findByText('Newest');
      const slot = screen.getByRole('button', { name: 'Pin “Newest”' })
        .parentElement as HTMLElement;
      expect(window.getComputedStyle(slot).opacity).toBe('0');

      const touchRules = Array.from(document.styleSheets)
        .flatMap(sheet => Array.from(sheet.cssRules))
        .filter(
          (rule): rule is CSSMediaRule =>
            rule instanceof CSSMediaRule && rule.conditionText === TOUCH_QUERY,
        )
        .flatMap(rule => Array.from(rule.cssRules) as CSSStyleRule[]);
      const slotClasses = Array.from(slot.classList).map(name => `.${name}`);
      expect(
        touchRules.some(
          rule =>
            slotClasses.includes(rule.selectorText) &&
            rule.style.opacity === '1',
        ),
      ).toBe(true);
    });
  });

  it('offers no pin affordance outside the shell rail', async () => {
    await renderRecent();

    await screen.findByText('Newest');
    expect(
      screen.queryByRole('button', { name: /Pin/ }),
    ).not.toBeInTheDocument();
  });

  it('says so when there is no session', async () => {
    listSessions.mockResolvedValue([]);

    await renderRecent();

    expect(await screen.findByText('No sessions yet')).toBeInTheDocument();
  });

  it('reads the sessions within the flush the unbound case waits out', async () => {
    await renderRecent();

    await act(() => new Promise(resolve => setTimeout(resolve, 100)));

    expect(listSessions).toHaveBeenCalledWith('gazelle');
  });

  it('renders nothing and reads nothing when the sessions route is not bound', async () => {
    await renderRecent({ mounted: false });

    // Long enough for the mounted case's fetch chain to reach listSessions.
    await act(() => new Promise(resolve => setTimeout(resolve, 100)));

    expect(screen.queryByText('Recent')).not.toBeInTheDocument();
    expect(listInstallations).not.toHaveBeenCalled();
    expect(listSessions).not.toHaveBeenCalled();
    expect(listSessionStates).not.toHaveBeenCalled();
  });
});

describe('pickRecentSessions', () => {
  const row = (id: string, createdAt?: string): SessionRow => ({
    id,
    sessionId: id,
    installation: 'gazelle',
    title: id,
    agentName: '',
    createdAt,
  });

  it('keeps the newest by start time and puts undated sessions last', () => {
    expect(
      pickRecentSessions(
        [
          row('undated'),
          row('a', '2026-07-01T00:00:00Z'),
          row('b', '2026-07-03T00:00:00Z'),
        ],
        3,
      ).map(r => r.id),
    ).toEqual(['b', 'a', 'undated']);
  });

  it('with states, orders by last activity', () => {
    const states = new Map([
      [
        'a',
        {
          sessionId: 'a',
          state: 'working',
          changedAt: Date.parse('2026-07-10T00:00:00Z'),
        },
      ],
    ]);
    expect(
      pickRecentSessions(
        [row('a', '2026-07-01T00:00:00Z'), row('b', '2026-07-03T00:00:00Z')],
        2,
        states,
      ).map(r => r.id),
    ).toEqual(['a', 'b']);
  });

  it('caps the list at the limit', () => {
    expect(
      pickRecentSessions(
        [row('a', '2026-07-01T00:00:00Z'), row('b', '2026-07-02T00:00:00Z')],
        1,
      ).map(r => r.id),
    ).toEqual(['b']);
  });
});

describe('railSessionGroup', () => {
  const now = new Date('2026-10-09T12:00:00');

  it.each([
    ['2026-10-09T00:00:00', 'today'],
    ['2026-10-10T08:00:00', 'today'], // clock skew counts as today
    ['2026-10-08T23:59:00', 'week'],
    ['2026-10-02T00:00:00', 'week'],
    ['2026-10-01T23:59:00', 'earlier'],
    [undefined, 'earlier'],
  ])('buckets %s as %s', (activeAt, expected) => {
    expect(
      railSessionGroup(activeAt ? Date.parse(activeAt) : undefined, now),
    ).toBe(expected);
  });
});

describe('lastActiveAt', () => {
  const row = (createdAt?: string): SessionRow => ({
    id: 'gazelle/a',
    sessionId: 'a',
    installation: 'gazelle',
    title: 'a',
    agentName: '',
    createdAt,
  });

  it('is the later of the start and the last state change', () => {
    const started = '2026-07-01T00:00:00Z';
    expect(lastActiveAt(row(started))).toBe(Date.parse(started));
    expect(
      lastActiveAt(row(started), {
        sessionId: 'a',
        state: 'completed',
        changedAt: Date.parse('2026-07-05T00:00:00Z'),
      }),
    ).toBe(Date.parse('2026-07-05T00:00:00Z'));
    expect(lastActiveAt(row())).toBeUndefined();
  });
});
