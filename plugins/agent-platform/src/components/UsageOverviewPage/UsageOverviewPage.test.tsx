import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { usageRouteRef } from '../../routes';
import type { LlmUsage } from '../../lib/llmUsage';
import type { LlmUsageViewModel } from '../../hooks/useLlmUsageView';
import { UsageOverviewPage } from './UsageOverviewPage';

/** Enough of an `LlmUsage` for the tiles and the two breakdown cards. */
function usage(overrides: Partial<LlmUsage['totals']> = {}): LlmUsage {
  return {
    windowDays: 30,
    totals: {
      costUsd: 10,
      previousCostUsd: 8,
      tokens: 5_000_000,
      calls: 1_234,
      agents: 4,
      models: 2,
      usdPerMillion: 2,
      avgTokensPerCall: 100,
      cacheReadSharePct: 10,
      ...overrides,
    },
    byAgent: [
      {
        id: 'org|writer',
        namespace: 'org',
        agent: 'writer',
        kind: 'agent',
        label: 'Release Notes Writer',
        tokens: 4_000_000,
        calls: 1_000,
        costUsd: 8,
        sharePct: 80,
      },
      {
        id: 'org|triage',
        namespace: 'org',
        agent: 'triage',
        kind: 'agent',
        label: 'Support Triage',
        tokens: 1_000_000,
        calls: 234,
        costUsd: 2,
        sharePct: 20,
      },
    ],
    byModel: [
      {
        id: 'sonnet',
        model: 'sonnet-4-5',
        tokens: 5_000_000,
        calls: 1_234,
        costUsd: 10,
        usdPerMillion: 2,
        avgTokensPerCall: 100,
        sharePct: 100,
      },
    ],
    unpricedModels: [],
  } as unknown as LlmUsage;
}

const view: LlmUsageViewModel & { usage: LlmUsage | undefined } = {
  state: 'ready',
  usage: usage(),
  installation: 'gazelle',
  isResolvedFromAll: false,
  notReachable: [],
};

jest.mock('../../hooks/useLlmUsageView', () => ({
  useLlmUsageView: () => view,
}));

/** Enough of a `SessionUsageResponse` for the sessions tile and the fallback. */
function sessionUsage(overrides: Record<string, unknown> = {}) {
  return {
    totals: {
      sessions: 37,
      turns: 120,
      inputTokens: 8_000_000,
      outputTokens: 400_000,
      totalTokens: 8_400_000,
      toolCalls: 300,
    },
    windowDays: 30,
    daily: [],
    byAgent: [
      { agentId: 'kagent__NS__writer', sessions: 30, turns: 100 },
      { agentId: 'kagent__NS__triage', sessions: 7, turns: 20 },
      // The row kagent could not attribute: not an agent, so not counted.
      { agentId: null, sessions: 1, turns: 1 },
    ],
    topTools: [],
    topMcpServers: [],
    undatedTurns: 0,
    unreadable: [],
    skipped: 0,
    ...overrides,
  };
}

const sessionUsageState = {
  usage: sessionUsage() as ReturnType<typeof sessionUsage> | undefined,
  isLoading: false,
  isError: false,
  isNotDeployed: false,
  refetch: () => {},
};

jest.mock('../../hooks/useSessionUsage', () => ({
  useSessionUsage: () => sessionUsageState,
}));

// The installation currency config (O3): gazelle shows EUR at 0.5 per USD
// when the test flips it on.
let currencyFor: Record<string, unknown> = {};
jest.mock('@giantswarm/backstage-plugin-gs-react', () => ({
  useSignedInConfig: () => ({
    config: {
      getOptional: (key: string) =>
        key === 'gs.installations' ? currencyFor : undefined,
    },
  }),
}));

function renderPage(path = '/agent-platform/usage/overview') {
  return renderInTestApp(<UsageOverviewPage />, {
    initialRouteEntries: [path],
    mountedRoutes: { '/agent-platform/usage': usageRouteRef },
  });
}

describe('UsageOverviewPage', () => {
  beforeEach(() => {
    view.state = 'ready';
    view.usage = usage();
    currencyFor = {};
    sessionUsageState.usage = sessionUsage();
    sessionUsageState.isNotDeployed = false;
    sessionUsageState.isError = false;
  });

  it('renders the KPI tiles from the gateway totals', async () => {
    renderPage();

    expect(await screen.findByText('Spend')).toBeInTheDocument();
    // The tile, and the by-model row that carries the same total.
    expect(screen.getAllByText('$10.00').length).toBeGreaterThan(0);
    // spendChangePct(10, 8) = +25% against the previous window.
    expect(screen.getByText('▲ 25% vs previous 30 days')).toBeInTheDocument();
    expect(screen.getByText('5.0M')).toBeInTheDocument();
    expect(screen.getByText('Active agents')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows the reader their own session count beside the platform figures', async () => {
    renderPage();

    expect(await screen.findByText('Your sessions')).toBeInTheDocument();
    expect(screen.getByText('37')).toBeInTheDocument();
  });

  it('omits the sessions tile where kagent is not deployed', async () => {
    sessionUsageState.isNotDeployed = true;

    renderPage();

    expect(await screen.findByText('Spend')).toBeInTheDocument();
    expect(screen.queryByText('Your sessions')).toBeNull();
  });

  it('shows no delta without a previous window to compare against', async () => {
    view.usage = usage({ previousCostUsd: undefined });

    renderPage();

    expect((await screen.findAllByText('$10.00')).length).toBeGreaterThan(0);
    expect(screen.queryByText(/vs previous/)).toBeNull();
  });

  it('converts the spend to the installation currency and labels it estimated', async () => {
    // O3/G19: convert via the per-installation currency config where set.
    currencyFor = { gazelle: { currency: { code: 'EUR', usdRate: 0.5 } } };

    renderPage();

    expect(await screen.findByText('Spend (estimated)')).toBeInTheDocument();
    // The tile, and conceivably a breakdown row that converts to the same
    // figure — both must be euros.
    expect(screen.getAllByText('€5.00').length).toBeGreaterThan(0);
    expect(screen.queryByText('$10.00')).toBeNull();
  });

  it('renders the per-agent and per-model breakdowns', async () => {
    renderPage();

    expect(await screen.findByText('Top agents')).toBeInTheDocument();
    expect(screen.getByText('Release Notes Writer')).toBeInTheDocument();
    expect(screen.getByText('By model')).toBeInTheDocument();
    expect(screen.getByText('sonnet-4-5')).toBeInTheDocument();
  });

  it('reads the window from the URL', async () => {
    renderPage('/agent-platform/usage/overview?window=7d');

    expect(await screen.findByText(/over the last 7 days/)).toBeInTheDocument();
  });

  it('lays its content out in the platform content column', async () => {
    // The Usage views used to fill the whole content area; they follow the
    // rest of the platform now (the ShellPage idiom: a centered max-width
    // column).
    const { container } = await renderPage();

    expect(await screen.findByText('Spend')).toBeInTheDocument();
    expect(
      container.querySelector('[style*="max-width: 1080px"]'),
    ).not.toBeNull();
  });

  describe('without gateway metrics (mimirEnabled: false)', () => {
    beforeEach(() => {
      view.state = 'unavailable';
      view.usage = undefined;
    });

    it('shows the kagent-derived tiles instead of a mostly-empty page', async () => {
      renderPage();

      // What kagent alone can answer: the reader's own figures.
      expect(await screen.findByText('Your sessions')).toBeInTheDocument();
      expect(screen.getByText('37')).toBeInTheDocument();
      expect(screen.getByText('Your tokens')).toBeInTheDocument();
      expect(screen.getByText('8.4M')).toBeInTheDocument();
      // Two agents attributed; the null row is not an agent.
      expect(screen.getByText('Your agents')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      // And why the fleet-wide figures are missing, in one note.
      expect(
        screen.getByText(/need the gateway's gen_ai metrics/i),
      ).toBeInTheDocument();
      // No gateway tiles, and nothing invented: no spend figure at all.
      expect(screen.queryByText('Spend')).toBeNull();
      expect(screen.queryByText('Top agents')).toBeNull();
    });

    it('shows the reported cost only when a runtime reported one', async () => {
      sessionUsageState.usage = sessionUsage({
        totals: {
          ...sessionUsage().totals,
          reportedCostUsd: 12.5,
        },
      });

      renderPage();

      expect(await screen.findByText('Reported cost')).toBeInTheDocument();
      expect(screen.getByText('$12.50')).toBeInTheDocument();
    });

    it('omits the reported-cost tile when no runtime reported one', async () => {
      renderPage();

      expect(await screen.findByText('Your sessions')).toBeInTheDocument();
      // "Not reported" is not "$0.00".
      expect(screen.queryByText('Reported cost')).toBeNull();
    });

    it('keeps the plain unavailable state when kagent is absent too', async () => {
      sessionUsageState.isNotDeployed = true;
      sessionUsageState.usage = undefined;

      renderPage();

      expect(
        await screen.findByText(/has no observability stack/),
      ).toBeInTheDocument();
      expect(screen.queryByText('Your tokens')).toBeNull();
    });
  });
});
