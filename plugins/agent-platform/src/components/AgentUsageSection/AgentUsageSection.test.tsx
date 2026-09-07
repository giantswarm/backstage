import { render, screen } from '@testing-library/react';
import { SessionUsageResponse } from '@giantswarm/backstage-plugin-agent-platform-common';
import { AgentUsageSection } from './AgentUsageSection';

const state = {
  installation: 'gazelle' as string | undefined,
  candidates: ['gazelle'] as string[],
  isResolvedFromAll: false,
  notReachable: [] as string[],
  isResolving: false,
  hasInstallations: true,
  isUserScoped: true as boolean | undefined,
  usage: undefined as SessionUsageResponse | undefined,
  isLoading: false,
  isError: false,
  isNotDeployed: false,
};

const DEFAULTS = { ...state };

jest.mock('../../hooks/useUsageInstallation', () => ({
  useUsageInstallation: () => ({
    installation: state.installation,
    candidates: state.candidates,
    isResolvedFromAll: state.isResolvedFromAll,
    notReachable: state.notReachable,
    isLoading: state.isResolving,
    hasInstallations: state.hasInstallations,
  }),
}));

jest.mock('../../hooks/useSessionUsage', () => ({
  useSessionUsage: () => ({
    usage: state.usage,
    isLoading: state.isLoading,
    isError: state.isError,
    isNotDeployed: state.isNotDeployed,
    refetch: () => {},
  }),
}));

jest.mock('../../hooks/useKagentCapabilities', () => ({
  useKagentCapabilities: () => ({ isUserScoped: state.isUserScoped }),
}));

jest.mock('../AgentsDataProvider', () => ({
  useAgents: () => ({ rows: [] }),
}));

jest.mock('../InstallationGroups', () => ({
  InstallationScopeNote: () => null,
}));

// The charts and tables are exercised by their own tests; stubbing them keeps
// this file about which state renders, which is the thing that is easy to break.
jest.mock('./TokensPerDayCard', () => ({
  TokensPerDayCard: ({ title }: { title: string }) => <div>{title}</div>,
}));
jest.mock('./ByAgentTable', () => ({
  ByAgentTable: () => <div>by agent</div>,
}));
jest.mock('./TopCallsTable', () => ({
  TopCallsTable: ({ title }: { title: string }) => <div>{title}</div>,
}));

// Partial: replacing the module wholesale breaks the api-ref factories
// core-plugin-api builds at import time.
jest.mock('@backstage/frontend-plugin-api', () => ({
  ...jest.requireActual('@backstage/frontend-plugin-api'),
  useRouteRef: () => undefined,
}));

function usage(overrides: Partial<SessionUsageResponse> = {}) {
  return {
    evaluatedAt: Date.parse('2026-09-04T12:00:00Z'),
    windowStart: Date.parse('2026-08-05T12:00:00Z'),
    windowDays: 30,
    totals: {
      sessions: 2,
      turns: 5,
      inputTokens: 8_400_000,
      outputTokens: 104_000,
      totalTokens: 8_504_000,
      toolCalls: 231,
    },
    daily: [
      { day: '2026-09-04', inputTokens: 100, outputTokens: 10, turns: 1 },
    ],
    byAgent: [],
    topTools: [],
    topMcpServers: [],
    undatedTurns: 0,
    unreadable: [],
    skipped: 0,
    ...overrides,
  } as SessionUsageResponse;
}

beforeEach(() => {
  Object.assign(state, DEFAULTS);
});

describe('AgentUsageSection', () => {
  it('renders the totals and both charts once there is usage', () => {
    state.usage = usage();
    render(<AgentUsageSection />);

    expect(screen.getByText('Your agent usage')).toBeInTheDocument();
    expect(screen.getByText('8.4M')).toBeInTheDocument();
    expect(screen.getByText('Input tokens per day')).toBeInTheDocument();
    expect(screen.getByText('Output tokens per day')).toBeInTheDocument();
  });

  it('says so when the window is empty, rather than showing zeros', () => {
    // A strip of zeros beside two empty charts reads as a broken page.
    state.usage = usage({
      totals: {
        sessions: 0,
        turns: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        toolCalls: 0,
      },
    });
    render(<AgentUsageSection />);

    expect(
      screen.getByText(/no agent sessions on gazelle/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Input tokens per day')).not.toBeInTheDocument();
  });

  it('reports an installation the portal cannot reach', () => {
    state.notReachable = ['gazelle'];
    render(<AgentUsageSection />);

    expect(
      screen.getByText(/not reachable from this portal/i),
    ).toBeInTheDocument();
  });

  it('says kagent is absent rather than calling it a failure', () => {
    state.isNotDeployed = true;
    render(<AgentUsageSection />);

    expect(
      screen.getByText(/kagent is not installed on gazelle/i),
    ).toBeInTheDocument();
  });

  it('reports a real read failure', () => {
    state.isError = true;
    render(<AgentUsageSection />);

    expect(screen.getByText(/Couldn't read/i)).toBeInTheDocument();
  });

  it('says nothing runs kagent when nothing does', () => {
    state.candidates = [];
    state.installation = undefined;
    render(<AgentUsageSection />);

    expect(screen.getByText(/none of the installations/i)).toBeInTheDocument();
  });

  it('reports a portal that knows no installations', () => {
    state.hasInstallations = false;
    state.candidates = [];
    state.installation = undefined;
    render(<AgentUsageSection />);

    expect(screen.getByText(/knows no installations/i)).toBeInTheDocument();
  });

  it('names the installation it chose under the "all" scope', () => {
    state.isResolvedFromAll = true;
    state.usage = usage();
    render(<AgentUsageSection />);

    expect(screen.getByText(/Showing gazelle/)).toBeInTheDocument();
  });

  describe('when kagent does not scope sessions to the caller', () => {
    beforeEach(() => {
      state.isUserScoped = false;
      state.usage = usage();
    });

    it('warns, and drops every claim of ownership', () => {
      // Promising "your" at the top and retracting it in a warning below is the
      // failure this switch exists to avoid. Asserted as an *absence*, because
      // that is the requirement — and it is what catches a future copy edit
      // reintroducing the claim.
      render(<AgentUsageSection />);

      expect(
        screen.getByText('These numbers are not scoped to you'),
      ).toBeInTheDocument();
      expect(screen.getByText('Agent usage')).toBeInTheDocument();
      expect(screen.queryByText(/\byour\b/i)).not.toBeInTheDocument();
      expect(screen.queryByText('Your agent usage')).not.toBeInTheDocument();
      expect(screen.queryByText('Your top tools')).not.toBeInTheDocument();
    });
  });

  it('does not warn while the scoping probe is unresolved', () => {
    // `undefined` means "we cannot tell", which is reachable on a healthy
    // deployment. Only an explicit `false` has earned the warning.
    state.isUserScoped = undefined;
    state.usage = usage();
    render(<AgentUsageSection />);

    expect(
      screen.queryByText('These numbers are not scoped to you'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Your agent usage')).toBeInTheDocument();
  });

  it('admits partial coverage when the backend skipped sessions', () => {
    state.usage = usage({ skipped: 6, unreadable: ['x'] });
    render(<AgentUsageSection />);

    expect(screen.getByText(/were not read/i)).toBeInTheDocument();
    expect(screen.getByText(/could not be read at all/i)).toBeInTheDocument();
  });
});
