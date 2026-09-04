import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { sessionsRouteRef } from '../../routes';
import { SessionSwitcherRail } from './SessionSwitcherRail';
import type { SessionSwitcherView } from './useSessionSwitcher';
import { groupActiveSessions } from './helpers';
import type { SessionRow } from '../SessionsDataProvider/helpers';

const STORAGE_KEY = 'gs-agent-platform-session-rail-collapsed';
const NOW = Date.parse('2026-09-04T12:00:00.000Z');
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => (installation: string, name: string) =>
    `https://avatars.${installation}.example/v1/48/${name}.png`,
}));

const mockUseSessionSwitcher = jest.fn();
jest.mock('./useSessionSwitcher', () => ({
  useSessionSwitcher: (...args: unknown[]) => mockUseSessionSwitcher(...args),
}));

function row(
  sessionId: string,
  overrides: Partial<SessionRow> = {},
): SessionRow {
  return {
    id: `gazelle/${sessionId}`,
    sessionId,
    installation: 'gazelle',
    title: `Session ${sessionId}`,
    agentName: 'SRE agent',
    agentTechnicalName: 'sre-agent',
    ...overrides,
  };
}

/** Build a view the way the real hook would, so grouping stays under test too. */
function view(
  overrides: Partial<SessionSwitcherView> = {},
): SessionSwitcherView {
  const groups = groupActiveSessions(
    [row('waiting-old'), row('waiting-new'), row('running-one')],
    new Map([
      [
        'waiting-old',
        {
          sessionId: 'waiting-old',
          state: 'input-required',
          changedAt: NOW - 2 * HOUR,
        },
      ],
      [
        'waiting-new',
        {
          sessionId: 'waiting-new',
          state: 'input-required',
          changedAt: NOW - 16 * MINUTE,
        },
      ],
      [
        'running-one',
        {
          sessionId: 'running-one',
          state: 'working',
          changedAt: NOW - 15 * MINUTE,
        },
      ],
    ]),
    NOW,
  );
  return {
    groups,
    activeCount: 3,
    isLoading: false,
    isStatesLoading: false,
    isError: false,
    now: NOW,
    refetch: jest.fn(),
    ...overrides,
  };
}

async function renderRail(currentSessionId?: string) {
  return renderInTestApp(
    <SessionSwitcherRail
      installation="gazelle"
      currentSessionId={currentSessionId}
    />,
    // Only the parent RouteRef is mountable — `mountedRoutes` rejects a
    // SubRouteRef — and the detail sub-route resolves relative to it.
    { mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef } },
  );
}

describe('SessionSwitcherRail', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUseSessionSwitcher.mockReturnValue(view());
  });

  it('heads the rail with the non-terminal count', async () => {
    await renderRail();

    expect(screen.getByText('Active sessions')).toBeInTheDocument();
    expect(screen.getByText('3 non-terminal')).toBeInTheDocument();
  });

  it('renders a heading per group with its count', async () => {
    await renderRail();

    const waiting = screen.getByRole('heading', { name: /Waiting/ });
    expect(within(waiting).getByText('(2)')).toBeInTheDocument();
    const running = screen.getByRole('heading', { name: /Running/ });
    expect(within(running).getByText('(1)')).toBeInTheDocument();
  });

  it('orders Waiting longest-blocked first', async () => {
    await renderRail();

    const links = screen.getAllByRole('link').map(a => a.textContent);
    expect(links[0]).toContain('Session waiting-old');
    expect(links[1]).toContain('Session waiting-new');
  });

  it('shows a compact single-unit age per card', async () => {
    await renderRail();

    expect(screen.getByText('2h')).toBeInTheDocument();
    expect(screen.getByText('16m')).toBeInTheDocument();
  });

  it('links each card to its session', async () => {
    await renderRail();

    expect(
      screen.getByRole('link', { name: /Session running-one/ }),
    ).toHaveAttribute('href', '/agent-platform/sessions/gazelle/running-one');
  });

  it('marks only the current session with aria-current', async () => {
    await renderRail('waiting-new');

    expect(
      screen.getByRole('link', { name: /Session waiting-new/ }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('link', { name: /Session running-one/ }),
    ).not.toHaveAttribute('aria-current');
  });

  it('highlights nothing when the current session is terminal', async () => {
    // A finished session is simply not in the rail. No special "off-rail" state
    // is needed — the page header handles wayfinding.
    await renderRail('some-completed-session');

    expect(
      screen.queryByRole('link', { current: 'page' }),
    ).not.toBeInTheDocument();
  });

  it('says so when nothing is active', async () => {
    mockUseSessionSwitcher.mockReturnValue(
      view({ groups: [], activeCount: 0 }),
    );
    await renderRail();

    expect(screen.getByText('All caught up.')).toBeInTheDocument();
  });

  it('shows ungrouped placeholders while the states resolve', async () => {
    // The guard against the "render everything, then hide most of it" flash.
    // Until states land we cannot tell which sessions are non-terminal, and the
    // rail's whole claim is that these are.
    mockUseSessionSwitcher.mockReturnValue(view({ isStatesLoading: true }));
    await renderRail();

    expect(screen.queryByRole('heading', { name: /Waiting/ })).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('3 non-terminal')).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it('offers a retry and no cards when the reads fail', async () => {
    // Deliberately no "recent sessions" fallback: presenting finished sessions
    // as active would invert the one claim the rail makes.
    const refetch = jest.fn();
    mockUseSessionSwitcher.mockReturnValue(view({ isError: true, refetch }));
    await renderRail();

    expect(
      screen.getByText('Couldn’t load active sessions.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  describe('collapsing', () => {
    it('hides the cards but keeps the per-group counts', async () => {
      await renderRail();

      await userEvent.click(
        screen.getByRole('button', { name: 'Collapse session switcher' }),
      );

      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.queryByText('Active sessions')).toBeNull();
      // The strip still answers "is anything waiting on me?".
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
    });

    it('remembers the choice across renders', async () => {
      const { unmount } = await renderRail();
      await userEvent.click(
        screen.getByRole('button', { name: 'Collapse session switcher' }),
      );
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true');
      unmount();

      await renderRail();

      expect(
        screen.getByRole('button', { name: 'Expand session switcher' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('link')).toBeNull();
    });

    it('expands again', async () => {
      window.localStorage.setItem(STORAGE_KEY, 'true');
      await renderRail();

      await userEvent.click(
        screen.getByRole('button', { name: 'Expand session switcher' }),
      );

      expect(screen.getByText('Active sessions')).toBeInTheDocument();
      expect(screen.getAllByRole('link')).toHaveLength(3);
    });
  });
});
