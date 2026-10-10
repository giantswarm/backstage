import { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/test-utils';
import { McpUsage, MusterApi, musterApiRef } from '../../apis';
import {
  MusterInstance,
  MusterInstanceContext,
} from '../MusterInstanceProvider';
import { makeTestMusterInstance } from '../MusterInstanceProvider/testInstance';
import { McpUsageSection } from './McpUsageSection';

// The section brings its own MusterProviders so it can be mounted anywhere;
// passed through here so these tests keep injecting MusterInstanceContext
// directly rather than standing up the real provider stack.
jest.mock('../MusterProviders', () => ({
  MusterProviders: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  // recharts needs layout jsdom will not do, so the tooltip never renders;
  // record what it would show for each bucket instead.
  StackedBarChart: ({
    data,
    series,
    formatValue,
    showLegend,
  }: {
    data: Record<string, number>[];
    series: { dataKey: string }[];
    formatValue?: (value: number) => string;
    showLegend?: boolean;
  }) => (
    <div
      data-testid="chart"
      data-legend={String(Boolean(showLegend))}
      data-tooltip-values={JSON.stringify(
        data.map(row =>
          series.map(s =>
            formatValue ? formatValue(row[s.dataKey]) : String(row[s.dataKey]),
          ),
        ),
      )}
    />
  ),
}));

const NOTE =
  'muster on wombat is not reachable from this portal (no answer within 3000 ms).';

function instance(): MusterInstance {
  const installationInfos = [
    { name: 'gazelle', requiresAuth: true, reachable: true as const },
    {
      name: 'wombat',
      requiresAuth: true,
      reachable: false as const,
      reason: 'no answer within 3000 ms',
    },
  ];
  return makeTestMusterInstance({
    installations: ['gazelle', 'wombat'],
    installationInfos,
    activeInstallation: 'wombat',
    scope: 'wombat',
    activeInstallationInfo: installationInfos[1],
  });
}

describe('McpUsageSection on an installation the portal cannot reach', () => {
  it('says so instead of the metrics, offers no connect and asks the backend nothing', async () => {
    const api = {
      getMcpUsage: jest.fn(),
      filterTools: jest.fn(),
      signIn: jest.fn(),
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TestApiProvider apis={[[musterApiRef, api as unknown as MusterApi]]}>
        <QueryClientProvider client={queryClient}>
          <MusterInstanceContext.Provider value={instance()}>
            {children}
          </MusterInstanceContext.Provider>
        </QueryClientProvider>
      </TestApiProvider>
    );

    render(<McpUsageSection />, { wrapper });

    expect(
      screen.getByText(
        `Usage metrics are read through a live muster session. ${NOTE}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /connect|retry|sign in/i }),
    ).toBeNull();
    expect(screen.queryByText(/Usage unavailable/)).toBeNull();

    await act(() => new Promise(resolve => setTimeout(resolve, 20)));
    expect(api.getMcpUsage).not.toHaveBeenCalled();
    expect(api.filterTools).not.toHaveBeenCalled();
  });

  it('renders neither an installation picker nor a time-range control', async () => {
    // Both went when this moved onto the shared Usage page: the page header
    // already carries the section's installation scope, and one section's own
    // window control would make the page's stated window false for the other.
    const api = {
      getMcpUsage: jest.fn(),
      filterTools: jest.fn(),
      signIn: jest.fn(),
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TestApiProvider apis={[[musterApiRef, api as unknown as MusterApi]]}>
        <QueryClientProvider client={queryClient}>
          <MusterInstanceContext.Provider value={instance()}>
            {children}
          </MusterInstanceContext.Provider>
        </QueryClientProvider>
      </TestApiProvider>
    );

    render(<McpUsageSection />, { wrapper });

    expect(screen.queryByRole('group', { name: /time range/i })).toBeNull();
    for (const label of ['24h', '7d', '30d']) {
      expect(screen.queryByRole('button', { name: label })).toBeNull();
    }
    expect(screen.queryByRole('combobox')).toBeNull();

    // And the heading says whose numbers these are, which is what keeps it from
    // being read as the personal section above it.
    expect(
      screen.getByText('Connector tool calls on this environment'),
    ).toBeInTheDocument();

    await act(() => new Promise(resolve => setTimeout(resolve, 20)));
  });
});

describe('McpUsageSection chart', () => {
  it('shows whole call counts in the tooltip and a legend for its three outcomes', async () => {
    const usage: McpUsage = {
      available: true,
      range_hours: 720,
      step_hours: 24,
      buckets: [
        {
          start: '2026-09-19T00:00:00.000Z',
          ok: 5270.571037859098,
          error_result: 17.035479153479447,
          error: 281.90924089857793,
        },
      ],
      totals: {
        calls: 5569.515757911151,
        errors: 298.9447200520574,
        error_ratio: 0.054,
        p95_seconds: 0.4,
        distinct_tools: 3,
      },
      top_tools: [],
      servers: [],
    };
    const api = {
      getMcpUsage: jest.fn().mockResolvedValue(usage),
      filterTools: jest.fn().mockResolvedValue({ tools: [] }),
      signIn: jest.fn(),
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const reachable = {
      ...instance(),
      activeInstallation: 'gazelle',
      scope: 'gazelle',
      activeInstallationInfo: instance().installationInfos[0],
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TestApiProvider apis={[[musterApiRef, api as unknown as MusterApi]]}>
        <QueryClientProvider client={queryClient}>
          <MusterInstanceContext.Provider value={reachable}>
            {children}
          </MusterInstanceContext.Provider>
        </QueryClientProvider>
      </TestApiProvider>
    );

    render(<McpUsageSection />, { wrapper });

    const chart = await screen.findByTestId('chart');
    expect(
      JSON.parse(chart.getAttribute('data-tooltip-values') ?? '[]'),
    ).toEqual([['5,271', '17', '282']]);
    // Three series told apart by fill alone need a legend.
    expect(chart).toHaveAttribute('data-legend', 'true');
  });
});

describe('McpUsageSection connectors table', () => {
  /** A usage body with these connectors, busiest first as the route sends. */
  function usageWith(serverCount: number): McpUsage {
    return {
      available: true,
      range_hours: 720,
      step_hours: 24,
      buckets: [],
      totals: {
        calls: 1_000,
        errors: 0,
        error_ratio: 0,
        p95_seconds: 0.4,
        distinct_tools: 3,
      },
      top_tools: [],
      servers: Array.from({ length: serverCount }, (_, i) => ({
        server: `connector-${String(i).padStart(3, '0')}`,
        calls: 1_000 - i,
        errors: 0,
      })),
    };
  }

  async function renderWith(usage: McpUsage) {
    const api = {
      getMcpUsage: jest.fn().mockResolvedValue(usage),
      filterTools: jest.fn().mockResolvedValue({ tools: [] }),
      signIn: jest.fn(),
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const reachable = {
      ...instance(),
      activeInstallation: 'gazelle',
      scope: 'gazelle',
      activeInstallationInfo: instance().installationInfos[0],
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <TestApiProvider apis={[[musterApiRef, api as unknown as MusterApi]]}>
        <QueryClientProvider client={queryClient}>
          <MusterInstanceContext.Provider value={reachable}>
            {children}
          </MusterInstanceContext.Provider>
        </QueryClientProvider>
      </TestApiProvider>
    );
    render(<McpUsageSection />, { wrapper });
    await screen.findByText('connector-000');
  }

  function renderedConnectors(): string[] {
    return screen
      .getAllByText(/^connector-\d{3}$/)
      .map(cell => cell.textContent ?? '');
  }

  it('shows three connectors with no reveal control and no pagination', async () => {
    await renderWith(usageWith(3));

    expect(renderedConnectors()).toEqual([
      'connector-000',
      'connector-001',
      'connector-002',
    ]);
    expect(screen.queryByRole('button', { name: /^Show/ })).toBeNull();
    expect(screen.queryByText(/rows per page/i)).toBeNull();
  });

  it('renders the busiest 15 of 300 and offers the rest', async () => {
    await renderWith(usageWith(300));

    const shown = renderedConnectors();
    expect(shown).toHaveLength(15);
    expect(shown[0]).toBe('connector-000');
    expect(shown[14]).toBe('connector-014');
    expect(
      screen.getByRole('button', { name: 'Show all 300 connectors' }),
    ).toBeVisible();
  });

  it('reveals every connector in one click', async () => {
    // 30 rather than 300: the same click, without mounting 300 rows of data
    // bars in jsdom.
    await renderWith(usageWith(30));

    await act(async () => {
      screen.getByRole('button', { name: 'Show all 30 connectors' }).click();
    });
    expect(renderedConnectors()).toHaveLength(30);
  });
});
