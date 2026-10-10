import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { usageRouteRef } from '../../routes';
import type { LlmUsage } from '../../lib/llmUsage';
import type { LlmUsageViewModel } from '../../hooks/useLlmUsageView';
import { UsageOverviewPage } from './UsageOverviewPage';

/**
 * Enough of an `LlmUsage` for the tiles, the token trend, the top-agents card
 * and the health card.
 */
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
    tokensPerDay: { rows: [], series: [] },
    reliability: {
      totalRequests: 1_234,
      errorRequests: 5,
      errorRatePct: 0.4,
      rateLimited: 12,
      p50Seconds: 1.8,
      p95Seconds: 7.2,
      outputTokensPerSecond: 86,
    },
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

function renderPage(
  path = '/agent-platform/usage/overview',
  sections?: React.ReactNode[],
) {
  return renderInTestApp(<UsageOverviewPage sections={sections} />, {
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
    expect(screen.getByText('$10.00')).toBeInTheDocument();
    expect(screen.getByText('5.0M')).toBeInTheDocument();
    expect(screen.getByText('Active agents')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('2 models answered')).toBeInTheDocument();
  });

  // Live round L4.
  it('says "1 model answered" for a single model', async () => {
    view.usage = usage({ models: 1 });
    renderPage();

    expect(await screen.findByText('1 model answered')).toBeInTheDocument();
  });

  it('carries exactly one spend number, a teaser pointing to Cost', async () => {
    // T35: money has one home, the Cost tab. The Overview keeps the total as
    // a teaser — no change against the previous window, no breakdown.
    view.usage = usage();

    renderPage();

    expect(await screen.findByText('$10.00')).toBeInTheDocument();
    expect(screen.queryByText(/vs previous/)).toBeNull();
    expect(screen.getByRole('link', { name: 'see Cost' })).toHaveAttribute(
      'href',
      '/agent-platform/usage/cost',
    );
    // No other money on the page: not the per-agent or per-model spend.
    expect(screen.queryByText('$8.00')).toBeNull();
    expect(screen.queryByText('$2.00')).toBeNull();
    expect(screen.queryByText('By model')).toBeNull();
  });

  it('leaves the unpriced-models warning to the Cost tab', async () => {
    view.usage = {
      ...usage(),
      unpricedModels: [
        {
          id: 'mystery',
          requestModel: 'mystery',
          responseModel: 'mystery',
          status: 'Missing',
          lookups: 3,
        },
      ],
    } as unknown as LlmUsage;

    renderPage();

    expect(await screen.findByText('Spend')).toBeInTheDocument();
    expect(screen.queryByText(/no usable price/)).toBeNull();
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

  it('converts the spend to the installation currency and labels it estimated', async () => {
    // O3/G19: convert via the per-installation currency config where set.
    currencyFor = { gazelle: { currency: { code: 'EUR', usdRate: 0.5 } } };

    renderPage();

    expect(await screen.findByText('Spend (estimated)')).toBeInTheDocument();
    expect(screen.getByText('€5.00')).toBeInTheDocument();
    expect(screen.queryByText('$10.00')).toBeNull();
  });

  it('ranks the top agents by model calls, not by spend', async () => {
    renderPage();

    expect(await screen.findByText('Top agents')).toBeInTheDocument();
    expect(screen.getByText('Release Notes Writer')).toBeInTheDocument();
    expect(screen.getByText('1,000')).toBeInTheDocument();
    // Live round L3: the count and the share are read apart, not as "100081%".
    expect(screen.getByText('1,000').textContent).toBe(
      '1,000 model calls, 81%',
    );
    // 1,000 of 1,234 calls.
    expect(
      screen.getByRole('img', {
        name: 'Release Notes Writer: 81% of model calls',
      }),
    ).toBeInTheDocument();
    // The per-model breakdown is the Cost tab's.
    expect(screen.queryByText('sonnet-4-5')).toBeNull();
  });

  it('shows the token trend and the gateway health that used to be Technical details', async () => {
    renderPage();

    expect(
      await screen.findByText('Tokens per day, by type'),
    ).toBeInTheDocument();
    expect(screen.getByText('Gateway health')).toBeInTheDocument();
    expect(screen.getByText('Call duration p95')).toBeInTheDocument();
    expect(screen.queryByText(/Technical details/)).toBeNull();
  });

  it('renders the muster-contributed section below the gateway figures', async () => {
    renderPage('/agent-platform/usage/overview', [
      <div key="mcp">contributed tool-call section</div>,
    ]);

    expect(
      await screen.findByText('contributed tool-call section'),
    ).toBeInTheDocument();
    expect(screen.getByText('Gateway health')).toBeInTheDocument();
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

    it('shows no cost even when a runtime reported one', async () => {
      // T35: the reported cost is the reader's own — its home is Your
      // sessions (and the Cost tab's gateway-less state), not the Overview.
      sessionUsageState.usage = sessionUsage({
        totals: {
          ...sessionUsage().totals,
          reportedCostUsd: 12.5,
        },
      });

      renderPage();

      expect(await screen.findByText('Your sessions')).toBeInTheDocument();
      expect(screen.queryByText('Reported cost')).toBeNull();
      expect(screen.queryByText('$12.50')).toBeNull();
    });

    it('still renders the muster-contributed section', async () => {
      // Its data source (muster's own metrics) is independent of the gateway's.
      renderPage('/agent-platform/usage/overview', [
        <div key="mcp">contributed tool-call section</div>,
      ]);

      expect(
        await screen.findByText('contributed tool-call section'),
      ).toBeInTheDocument();
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
