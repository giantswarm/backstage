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

const sessionUsageState = {
  usage: { totals: { sessions: 37 }, windowDays: 30 },
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
    sessionUsageState.isNotDeployed = false;
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
});
