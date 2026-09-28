import { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/test-utils';
import { McpUsage, MusterApi, musterApiRef } from '../../apis';
import {
  MusterInstance,
  MusterInstanceContext,
} from '../MusterInstanceProvider';
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
  }: {
    data: Record<string, number>[];
    series: { dataKey: string }[];
    formatValue?: (value: number) => string;
  }) => (
    <div
      data-testid="chart"
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
  return {
    installations: ['gazelle', 'wombat'],
    installationInfos,
    isLoadingInstallations: false,
    activeInstallation: 'wombat',
    scope: 'wombat',
    homeInstallation: 'gazelle',
    isSingleInstallation: false,
    activeInstallationInfo: installationInfos[1],
    setActiveInstallation: jest.fn(),
    mcpServers: [],
    workflows: [],
    isLoading: false,
    dataUpdatedAt: undefined,
    isRefreshing: false,
    retry: jest.fn(),
    refreshInventory: jest.fn(),
  };
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
      screen.getByText('MCP tool calls on this installation'),
    ).toBeInTheDocument();

    await act(() => new Promise(resolve => setTimeout(resolve, 20)));
  });
});

describe('McpUsageSection chart', () => {
  it('shows whole call counts in the tooltip, although increase() returns fractions', async () => {
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
  });
});
