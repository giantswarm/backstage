import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { usageRouteRef } from '../../routes';
import type { LlmUsage } from '../../lib/llmUsage';
import { formatDayWithYear } from '../../lib/formatDay';
import {
  previousUsageMonth,
  usageMonthLabel,
  usageMonthOf,
} from '../../lib/usageWindow';
import type { LlmUsageViewModel } from '../../hooks/useLlmUsageView';
import { UsageCostPage } from './UsageCostPage';
import { SHELL_CONTENT_MAX_WIDTH } from '@giantswarm/backstage-plugin-ui-react';

// The organizations agent-manager names for the person
// (`list_organizations`).
jest.mock('../OrganizationDirectoryProvider', () => ({
  ...jest.requireActual('../OrganizationDirectoryProvider'),
  useOrganizationDirectory: () =>
    jest.requireActual('../../lib/__fixtures__/organizations')
      .TEST_ORGANIZATION_DIRECTORY,
}));

// The chart and the two tables have their own tests; this file is about which
// figures the Cost tab carries, so they stand in as markers.
jest.mock('../LlmUsage', () => ({
  ...jest.requireActual('../LlmUsage'),
  CostPerDayCard: () => <div>cost-per-day</div>,
  LlmByAgentTable: () => <div>by-agent-table</div>,
  LlmByModelTable: () => <div>by-model-table</div>,
  LlmByPersonTable: () => <div>by-person-table</div>,
  LlmByOrganizationTable: ({
    hrefFor,
    rows,
  }: {
    hrefFor: (row: { kind: string; namespace: string }) => string | undefined;
    rows: { kind: string; namespace: string }[];
  }) => (
    <div>
      by-organization-table
      {rows.map(row => (
        <a key={row.namespace} href={hrefFor(row)}>
          {row.namespace || row.kind}
        </a>
      ))}
    </div>
  ),
  PricingCoverageNote: () => <div>pricing-coverage-note</div>,
}));

/** Enough of an `LlmUsage` for the headline row. */
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
      cacheReadSharePct: 38,
      ...overrides,
    },
    byAgent: [],
    byModel: [],
    byOrganization: [
      { kind: 'organization', namespace: 'org-acme' },
      { kind: 'platform', namespace: 'kagent' },
      { kind: 'unattributed', namespace: '' },
    ],
    costPerDay: { rows: [], series: [] },
    unpricedModels: [],
  } as unknown as LlmUsage;
}

const view: LlmUsageViewModel = {
  state: 'unavailable',
  usage: undefined,
  installation: 'gazelle',
  isResolvedFromAll: false,
  notReachable: [],
};

/** What the page last asked the usage view for: the window and the scope. */
let viewOptions: Record<string, unknown> | undefined;

jest.mock('../../hooks/useLlmUsageView', () => ({
  useLlmUsageView: (options: Record<string, unknown>) => {
    viewOptions = options;
    return view;
  },
}));

const sessionUsageState = {
  usage: undefined as Record<string, unknown> | undefined,
  isLoading: false,
  isError: false,
  isNotDeployed: false,
  refetch: () => {},
};

jest.mock('../../hooks/useSessionUsage', () => ({
  useSessionUsage: () => sessionUsageState,
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

function renderPage(path = '/usage/cost') {
  return renderInTestApp(<UsageCostPage />, {
    initialRouteEntries: [path],
    mountedRoutes: { '/usage': usageRouteRef },
  });
}

/**
 * The caption paragraph whose whole text matches: its installation is in a
 * `<strong>`, which a text matcher on one node's own text would skip.
 */
function caption(pattern: RegExp) {
  return screen.findByText(
    (_, node) => node?.tagName === 'P' && pattern.test(node.textContent ?? ''),
  );
}

describe('UsageCostPage without gateway metrics (mimirEnabled: false)', () => {
  beforeEach(() => {
    view.state = 'unavailable';
    sessionUsageState.usage = undefined;
    sessionUsageState.isNotDeployed = false;
  });

  it('keeps the honest empty state compact, in the platform content column', async () => {
    const { container } = await renderPage();

    expect(
      await screen.findByText(/has no observability stack/),
    ).toBeInTheDocument();
    // The ShellPage idiom: a centered max-width column, not full bleed.
    expect(
      container.querySelector(
        `[style*="max-width: ${SHELL_CONTENT_MAX_WIDTH}px"]`,
      ),
    ).not.toBeNull();
    // No invented figures.
    expect(screen.queryByText('Reported cost')).toBeNull();
  });

  it('adds the kagent-reported cost when the runtimes reported one', async () => {
    sessionUsageState.usage = {
      totals: { costUsd: 12.5 },
      windowDays: 30,
    };

    renderPage();

    expect(await screen.findByText('Reported cost')).toBeInTheDocument();
    expect(screen.getByText('$12.50')).toBeInTheDocument();
    expect(
      screen.getByText(/your sessions, over the last 30 days/),
    ).toBeInTheDocument();
  });

  it('shows no reported cost when kagent is absent', async () => {
    sessionUsageState.isNotDeployed = true;
    sessionUsageState.usage = {
      totals: { costUsd: 12.5 },
      windowDays: 30,
    };

    renderPage();

    expect(
      await screen.findByText(/has no observability stack/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Reported cost')).toBeNull();
  });
});

describe('UsageCostPage with gateway metrics', () => {
  beforeEach(() => {
    view.state = 'ready';
    view.usage = usage();
    currencyFor = {};
  });

  afterAll(() => {
    view.state = 'unavailable';
    view.usage = undefined;
  });

  it('heads the money with spend against the previous window, the blended rate and the cache share', async () => {
    renderPage();

    expect(await screen.findByText('Spend')).toBeInTheDocument();
    expect(screen.getByText('$10.00')).toBeInTheDocument();
    // spendChangePct(10, 8) = +25% against the previous window.
    expect(screen.getByText('▲ 25% vs previous 30 days')).toBeInTheDocument();
    expect(screen.getByText('Blended $/1M tokens')).toBeInTheDocument();
    expect(screen.getByText('$2.00')).toBeInTheDocument();
    expect(screen.getByText('Cache read share')).toBeInTheDocument();
    expect(screen.getByText('38%')).toBeInTheDocument();
    // Then the breakdowns.
    expect(screen.getByText('cost-per-day')).toBeInTheDocument();
    expect(screen.getByText('by-agent-table')).toBeInTheDocument();
    expect(screen.getByText('by-model-table')).toBeInTheDocument();
  });

  it('rolls the spend up by organization above the agents, and says whose spend it is and for whom', async () => {
    renderPage();

    expect(
      await screen.findByText('by-organization-table'),
    ).toBeInTheDocument();
    expect(
      await caption(
        /Shows the spend of every organization on gazelle over the last 30 days, for everyone who can read this environment's metrics\./,
      ),
    ).toBeInTheDocument();
    expect(viewOptions).toMatchObject({ days: 30, org: undefined });
    // An organization and the platform open the narrowed view; unattributed
    // traffic has no namespace to narrow to.
    expect(screen.getByRole('link', { name: 'org-acme' })).toHaveAttribute(
      'href',
      '/usage/cost?organization=org-acme',
    );
    expect(screen.getByRole('link', { name: 'kagent' })).toHaveAttribute(
      'href',
      '/usage/cost?organization=kagent',
    );
    expect(screen.getByText('unattributed')).not.toHaveAttribute('href');
    expect(screen.queryByText('Show all organizations')).toBeNull();
  });

  it('narrows to the organization a link names, keeps the other parameters, and offers the way back', async () => {
    renderPage('/usage/cost?window=7d&organization=org-acme');

    expect(
      await caption(/Shows the spend of the acme organization on gazelle/),
    ).toBeInTheDocument();
    expect(viewOptions).toMatchObject({ days: 7, org: 'org-acme' });
    // One organization is one row: the roll-up gives way.
    expect(screen.queryByText('by-organization-table')).toBeNull();
    expect(screen.getByText('by-agent-table')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Show all organizations' }),
    ).toHaveAttribute('href', '/usage/cost?window=7d');
  });

  it('reports a calendar month, with the by-person table, when a link names one', async () => {
    const month = previousUsageMonth(usageMonthOf(Date.now()));
    const label = usageMonthLabel(month);
    view.usage = { ...usage(), window: { kind: 'month', month } };

    renderPage(`/usage/cost?window=${month}`);

    expect(
      await caption(
        new RegExp(
          `Shows the spend of every organization on gazelle in ${label}, for everyone`,
        ),
      ),
    ).toBeInTheDocument();
    expect(viewOptions).toMatchObject({ month, byPerson: true });
    expect(screen.getByText('by-person-table')).toBeInTheDocument();
    expect(screen.getByText('by-organization-table')).toBeInTheDocument();
    // The change against the month before, not against "the previous N days".
    expect(
      screen.getByText(
        `▲ 25% vs ${usageMonthLabel(previousUsageMonth(month))}`,
      ),
    ).toBeInTheDocument();
  });

  it('shows no by-person table in a days window', async () => {
    renderPage('/usage/cost?window=7d');

    expect(await screen.findByText('by-agent-table')).toBeInTheDocument();
    expect(viewOptions).toMatchObject({
      days: 7,
      month: undefined,
      byPerson: false,
    });
    expect(screen.queryByText('by-person-table')).toBeNull();
  });

  it('names the platform as the scope in a sentence', async () => {
    renderPage('/usage/cost?organization=kagent');

    expect(
      await caption(/Shows the spend of the platform on gazelle/),
    ).toBeInTheDocument();
  });

  it("carries no activity figures — those are the Overview's", async () => {
    renderPage();

    expect(await screen.findByText('Spend')).toBeInTheDocument();
    expect(screen.queryByText('Active agents')).toBeNull();
    expect(screen.queryByText('Tokens')).toBeNull();
    expect(screen.queryByText('Gateway health')).toBeNull();
  });

  it('shows no delta without a previous window to compare against', async () => {
    view.usage = usage({ previousCostUsd: undefined });

    renderPage();

    expect(await screen.findByText('$10.00')).toBeInTheDocument();
    expect(screen.queryByText(/vs previous/)).toBeNull();
  });

  it('says since when the gateway has recorded calls when that cuts the window short', async () => {
    view.usage = {
      ...usage(),
      windowDays: 90,
      dataStart: { day: '2026-09-09', coveredDays: 36 },
    };

    renderPage();

    expect(
      await screen.findByText(
        `The gateway has recorded model calls only since ${formatDayWithYear('2026-09-09')}, so its figures cover 36 of the 90 days.`,
      ),
    ).toBeInTheDocument();
  });

  it('says nothing about the records when they cover the window', async () => {
    renderPage();

    expect(await screen.findByText('Spend')).toBeInTheDocument();
    expect(screen.queryByText(/recorded model calls only since/)).toBeNull();
  });

  it('converts the money to the installation currency and labels it estimated', async () => {
    currencyFor = { gazelle: { currency: { code: 'EUR', usdRate: 0.5 } } };

    renderPage();

    expect(await screen.findByText('Est. spend')).toBeInTheDocument();
    expect(screen.getByText('€5.00')).toBeInTheDocument();
    expect(screen.getByText('Blended cost/1M tokens')).toBeInTheDocument();
  });

  it('warns beside the headline when a model has no usable price', async () => {
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

    expect(
      await screen.findByText('1 model has no usable price'),
    ).toBeInTheDocument();
  });
});
