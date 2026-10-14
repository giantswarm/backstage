import { renderInTestApp } from '@backstage/frontend-test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState, type ReactNode } from 'react';

import { agentsRouteRef, sessionsRouteRef } from '../../routes';
import type { SessionsContextValue } from '../SessionsDataProvider';
import { SessionsIndexPage } from './SessionsIndexPage';

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => 'https://avatars.example/agent.png',
}));

const mockUseSessions = jest.fn<SessionsContextValue, []>();
jest.mock('../SessionsDataProvider', () => ({
  ...jest.requireActual('../SessionsDataProvider'),
  SessionsDataProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  useSessions: () => mockUseSessions(),
}));

// The table is not what these tests are about, and it mounts a bui Table with its
// own machinery.
jest.mock('../SessionsTable', () => ({
  SessionsTable: ({
    rows,
    hideColumns,
  }: {
    rows: unknown[];
    hideColumns?: string[];
  }) => (
    <div
      data-testid="sessions-table"
      data-hidden={hideColumns?.join(',') ?? ''}
    >
      {rows.length}
    </div>
  ),
}));

// The states summary is one more backend read this page's branches do not turn
// on; the table renders the column, and its own tests cover it.
jest.mock('../../hooks/useFleetSessionStates', () => ({
  useFleetSessionStates: () => ({
    states: new Map(),
    unreadable: new Set(),
    failedInstallations: new Set(),
    skippedCount: 0,
    isLoading: false,
    isError: false,
  }),
}));

// The scope note reads the section scope from gs; none of the page's branches
// depend on it, so it renders nothing here.
jest.mock('../InstallationScopeNote', () => ({
  InstallationScopeNote: () => null,
}));

// The inventory gate reads the installation inventory and the section scope
// from gs (kubernetes proxy, cluster-access status); it is covered by its own
// tests there and renders nothing in this page's state branches.
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-gs'),
  InstallationInventoryGate: () => null,
}));

// One session, for the tests that are about the page with a list on it. An empty
// `rows` is the first-run state now, which renders a different screen.
const session = {
  id: 'gazelle/s1',
  sessionId: 's1',
  installation: 'gazelle',
  title: 'Triage the incident',
  agentName: 'SRE Agent',
};

const loadedSessions: SessionsContextValue = {
  rows: [],
  scope: 'all',
  // The scoped kagent installations. At least one of them has to have actually
  // been queried before the page claims the user has never had a session.
  installations: ['gazelle'],
  isLoading: false,
  isLoadingMore: false,
  hasInstallations: true,
  unreachableInstallations: [],
  readFailures: {},
  notUserScopedInstallations: [],
  notReachableInstallations: [],
};

// Re-renders the page from *inside* the test app: RTL's `rerender` replaces the
// root children, which would drop the Router that `useRouteRef` needs.
function Rerenderable() {
  const [, bump] = useState(0);
  return (
    <>
      <button type="button" onClick={() => bump(n => n + 1)}>
        rerender
      </button>
      <SessionsIndexPage />
    </>
  );
}

async function renderRerenderable() {
  return renderInTestApp(<Rerenderable />, {
    mountedRoutes: {
      '/agent-platform/sessions': sessionsRouteRef,
      '/agent-platform/agents': agentsRouteRef,
    },
  });
}

async function render() {
  return renderInTestApp(<SessionsIndexPage />, {
    mountedRoutes: {
      '/agent-platform/sessions': sessionsRouteRef,
      // The Agents tab: the first-run state links into its create flow.
      '/agent-platform/agents': agentsRouteRef,
    },
  });
}

beforeEach(() => {
  window.localStorage.clear();
  mockUseSessions.mockReturnValue({ ...loadedSessions, rows: [session] });
});

describe('SessionsIndexPage', () => {
  it('titles itself and offers a new session', async () => {
    await render();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Sessions' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Find your conversations with agents.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New session' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByTestId('sessions-table')).toBeInTheDocument();
  });

  it('leaves starting a session to the start screen', async () => {
    await render();

    expect(
      screen.queryByRole('textbox', { name: 'Prompt' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });

  it('shows activity rather than a blank page while the sessions are read', async () => {
    mockUseSessions.mockReturnValue({ ...loadedSessions, isLoading: true });
    await render();

    expect(screen.getByTestId('progress')).toBeInTheDocument();
    expect(screen.queryByTestId('sessions-table')).not.toBeInTheDocument();
  });

  it('holds the read warning until the sessions are read', async () => {
    mockUseSessions.mockReturnValue({
      ...loadedSessions,
      isLoading: true,
      unreachableInstallations: ['gazelle'],
    });
    await renderRerenderable();
    expect(screen.getByTestId('progress')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    mockUseSessions.mockReturnValue({
      ...loadedSessions,
      unreachableInstallations: ['gazelle'],
    });
    fireEvent.click(screen.getByRole('button', { name: 'rerender' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not read 1 environment',
    );
  });

  describe('with no session on the fleet yet', () => {
    beforeEach(() => {
      mockUseSessions.mockReturnValue(loadedSessions);
    });

    it('says so, with where a session starts', async () => {
      await render();

      expect(
        screen.getByRole('heading', { level: 2, name: 'No sessions yet' }),
      ).toBeInTheDocument();
      expect(screen.getAllByRole('link', { name: 'New session' })).toHaveLength(
        2,
      );
      expect(screen.queryByTestId('sessions-table')).not.toBeInTheDocument();
    });

    it('leaves focus alone when the list was empty from the start', async () => {
      await render();

      expect(
        screen.getByRole('heading', { level: 2, name: 'No sessions yet' }),
      ).not.toHaveFocus();
    });

    it('takes focus when it replaces a list whose focus went with its last row', async () => {
      mockUseSessions.mockReturnValue({ ...loadedSessions, rows: [session] });
      await renderRerenderable();
      expect(screen.getByTestId('sessions-table')).toBeInTheDocument();

      // The row and its dialog are gone: focus fell back to the document.
      mockUseSessions.mockReturnValue(loadedSessions);
      (document.activeElement as HTMLElement | null)?.blur();
      fireEvent.click(screen.getByRole('button', { name: 'rerender' }));

      await waitFor(() =>
        expect(
          screen.getByRole('heading', { level: 2, name: 'No sessions yet' }),
        ).toHaveFocus(),
      );
    });

    it('says nothing per installation under "All installations" either', async () => {
      mockUseSessions.mockReturnValue({
        ...loadedSessions,
        installations: ['gazelle', 'golem'],
      });

      await render();

      expect(
        screen.queryByRole('heading', { level: 3 }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText('no sessions here')).not.toBeInTheDocument();
    });

    it('does not claim an empty history when the sessions could not be read', async () => {
      // An empty list because every read failed is not an empty history. The
      // warning is the answer.
      mockUseSessions.mockReturnValue({
        ...loadedSessions,
        unreachableInstallations: ['gazelle'],
      });

      await render();

      expect(
        screen.queryByRole('heading', { name: 'No sessions yet' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(/Could not read 1 environment/),
      ).toBeInTheDocument();
    });

    it('does not claim an empty history when no installation was ever queried', async () => {
      // Every kagent endpoint in scope is unreachable from this portal, so
      // nothing was asked on the user's behalf -- an empty list says nothing.
      mockUseSessions.mockReturnValue({
        ...loadedSessions,
        installations: ['gazelle', 'golem'],
        notReachableInstallations: ['gazelle', 'golem'],
      });

      await render();

      expect(
        screen.queryByRole('heading', { name: 'No sessions yet' }),
      ).not.toBeInTheDocument();
    });

    it('still claims an empty history when one installation answered and others are unreachable', async () => {
      // The one that answered is enough to know the user has no sessions; the
      // quiet note below names the rest.
      mockUseSessions.mockReturnValue({
        ...loadedSessions,
        installations: ['gazelle', 'golem'],
        notReachableInstallations: ['golem'],
      });

      await render();

      expect(
        screen.getByRole('heading', { name: 'No sessions yet' }),
      ).toBeInTheDocument();
    });
  });

  it('names why an installation could not be read and the request id to trace it', async () => {
    mockUseSessions.mockReturnValue({
      ...loadedSessions,
      unreachableInstallations: ['gazelle'],
      readFailures: {
        gazelle: { reason: 'authentication failed', requestId: 'req-7' },
      },
    });

    await render();

    expect(
      screen.getByText('Could not read 1 environment'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/gazelle \(authentication failed, request id req-7\)/),
    ).toBeInTheDocument();
  });

  it('names installations the portal cannot reach in a quiet note, not a warning', async () => {
    mockUseSessions.mockReturnValue({
      ...loadedSessions,
      notReachableInstallations: ['golem', 'wombat'],
    });

    await render();

    expect(
      screen.getByText('golem, wombat: not reachable from this portal'),
    ).toBeInTheDocument();
    // Never queried, so not a read failure: the warning card stays away.
    expect(screen.queryByText(/Could not read/)).toBeNull();
  });

  it('still explains an unconfigured instance', async () => {
    mockUseSessions.mockReturnValue({
      ...loadedSessions,
      hasInstallations: false,
    });
    await render();

    expect(screen.getByText('No environments configured')).toBeInTheDocument();
  });
});

describe('SessionsIndexPage under "All installations" on a multi-installation portal', () => {
  const gazelleSession = {
    id: 'gazelle/s1',
    sessionId: 's1',
    installation: 'gazelle',
    title: 'Triage the incident',
    agentName: 'SRE Agent',
  };
  const golemSession = {
    id: 'golem/s2',
    sessionId: 's2',
    installation: 'golem',
    title: 'Review the release',
    agentName: 'Reviewer',
  };

  beforeEach(() => {
    mockUseSessions.mockReturnValue({
      ...loadedSessions,
      rows: [gazelleSession, golemSession],
      installations: ['gazelle', 'golem', 'wombat'],
    });
  });

  it('renders every installation in one table, with no section of its own', async () => {
    await render();

    // One table holding both installations' rows: the Installation column tells
    // them apart. An installation with no sessions (wombat) gets no heading and
    // no placeholder — if it could not be read, the warning card below says so.
    const tables = screen.getAllByTestId('sessions-table');
    expect(tables).toHaveLength(1);
    expect(tables[0]).toHaveTextContent('2');
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    expect(screen.queryByText('not reachable from this portal')).toBeNull();
  });

  it('keeps the Installation column', async () => {
    await render();

    expect(screen.getByTestId('sessions-table')).toHaveAttribute(
      'data-hidden',
      '',
    );
  });

  it('keeps it while more installations are still loading', async () => {
    // The first to answer would otherwise hide it, and the next bring it back.
    mockUseSessions.mockReturnValue({
      ...loadedSessions,
      rows: [gazelleSession],
      installations: ['gazelle', 'golem'],
      isLoadingMore: true,
    });
    await render();

    expect(screen.getByTestId('sessions-table')).toHaveAttribute(
      'data-hidden',
      '',
    );
  });

  it('leaves searching to the table', async () => {
    // The page carried a field of its own only to search across the groups at
    // once. With one table, search belongs to the table (stubbed here), and a
    // second field above it would be two places to type the same thing.
    await render();

    expect(
      screen.queryByRole('searchbox', { name: 'Search sessions' }),
    ).not.toBeInTheDocument();
  });
});

describe('SessionsIndexPage with one installation to list from', () => {
  const gazelleSession = {
    id: 'gazelle/s1',
    sessionId: 's1',
    installation: 'gazelle',
    title: 'Triage the incident',
    agentName: 'SRE Agent',
  };

  it.each([
    ['pinned in the header', { scope: 'gazelle', installations: ['gazelle'] }],
    [
      'the only one running kagent',
      { scope: 'all', installations: ['gazelle'] },
    ],
    [
      'the only one reachable',
      {
        scope: 'all',
        installations: ['gazelle', 'golem'],
        notReachableInstallations: ['golem'],
      },
    ],
    [
      'the only one that answered',
      {
        scope: 'all',
        installations: ['gazelle', 'golem'],
        unreachableInstallations: ['golem'],
      },
    ],
  ])('drops the Environment column when it is %s', async (_, overrides) => {
    mockUseSessions.mockReturnValue({
      ...loadedSessions,
      rows: [gazelleSession],
      ...overrides,
    });
    await render();

    expect(screen.getByTestId('sessions-table')).toHaveAttribute(
      'data-hidden',
      'installation',
    );
  });
});
