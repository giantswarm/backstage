import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { LlmUsage } from '../../lib/llmUsage';
import type { LlmUsageViewModel } from '../../hooks/useLlmUsageView';
import { UsageTechnicalPage } from './UsageTechnicalPage';

/** Enough of an `LlmUsage` for the strip, the token chart and the health card. */
const USAGE = {
  windowDays: 30,
  totals: {
    costUsd: 10,
    tokens: 5_000_000,
    calls: 1_234,
    agents: 4,
    models: 2,
    usdPerMillion: 2,
    avgTokensPerCall: 100,
    cacheReadSharePct: 38,
  },
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

const view: LlmUsageViewModel & { usage: LlmUsage | undefined } = {
  state: 'ready',
  usage: USAGE,
  installation: 'gazelle',
  isResolvedFromAll: false,
  notReachable: [],
};

jest.mock('../../hooks/useLlmUsageView', () => ({
  useLlmUsageView: () => view,
}));

let currencyFor: Record<string, unknown> = {};
jest.mock('@giantswarm/backstage-plugin-gs-react', () => ({
  useSignedInConfig: () => ({
    config: {
      getOptional: (key: string) =>
        key === 'gs.installations' ? currencyFor : undefined,
    },
  }),
}));

function renderPage(sections?: React.ReactNode[]) {
  return renderInTestApp(<UsageTechnicalPage sections={sections} />, {
    initialRouteEntries: ['/agent-platform/usage/technical'],
  });
}

describe('UsageTechnicalPage', () => {
  beforeEach(() => {
    view.state = 'ready';
    view.usage = USAGE;
    currencyFor = {};
  });

  it('renders the raw gateway figures and the health card', async () => {
    renderPage();

    expect(await screen.findByText('Technical details')).toBeInTheDocument();
    // The totals strip: tokens, calls, the blended rate and the cache share.
    expect(screen.getByText('5.0M')).toBeInTheDocument();
    // The call count renders in the strip, and may also appear in the
    // reliability figures below it.
    expect(screen.getAllByText('1,234').length).toBeGreaterThan(0);
    expect(screen.getAllByText('38%').length).toBeGreaterThan(0);
    expect(screen.getByText('Gateway health')).toBeInTheDocument();
  });

  it('renders the muster-contributed section below the gateway figures', async () => {
    renderPage([<div key="mcp">contributed tool-call section</div>]);

    expect(
      await screen.findByText('contributed tool-call section'),
    ).toBeInTheDocument();
  });

  it('stands alone without a contributed section', async () => {
    renderPage();

    expect(await screen.findByText('Gateway health')).toBeInTheDocument();
    expect(screen.queryByText(/muster plugin/)).toBeNull();
  });

  it('converts the money figures to the installation currency', async () => {
    currencyFor = { gazelle: { currency: { code: 'EUR', usdRate: 0.5 } } };

    renderPage();

    expect(await screen.findByText('Cost (estimated)')).toBeInTheDocument();
    expect(screen.getByText('€5.00')).toBeInTheDocument();
  });
});
