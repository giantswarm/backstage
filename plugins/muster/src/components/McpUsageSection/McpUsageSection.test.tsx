import { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TestApiProvider } from '@backstage/test-utils';
import { MemoryRouter } from 'react-router-dom';
import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import { formatDayWithYear } from '@giantswarm/backstage-plugin-agent-platform-common';
import { McpUsage, MusterApi, musterApiRef } from '../../apis';
import {
  MusterInstance,
  MusterInstanceContext,
} from '../MusterInstanceProvider';
import { makeTestMusterInstance } from '../MusterInstanceProvider/testInstance';
import { McpUsageSection } from './McpUsageSection';

/** The Usage screen's address; a test sets `?window=` on it. */
let path = '/usage/connectors';
beforeEach(() => {
  path = '/usage/connectors';
});

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
      <MemoryRouter initialEntries={[path]}>
        <TestApiProvider apis={[[musterApiRef, api as unknown as MusterApi]]}>
          <QueryClientProvider client={queryClient}>
            <MusterInstanceContext.Provider value={instance()}>
              {children}
            </MusterInstanceContext.Provider>
          </QueryClientProvider>
        </TestApiProvider>
      </MemoryRouter>
    );

    render(<McpUsageSection />, { wrapper });

    expect(
      screen.getByText(`Usage metrics need a muster session. ${NOTE}`),
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
      <MemoryRouter initialEntries={[path]}>
        <TestApiProvider apis={[[musterApiRef, api as unknown as MusterApi]]}>
          <QueryClientProvider client={queryClient}>
            <MusterInstanceContext.Provider value={instance()}>
              {children}
            </MusterInstanceContext.Provider>
          </QueryClientProvider>
        </TestApiProvider>
      </MemoryRouter>
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
      <MemoryRouter initialEntries={[path]}>
        <TestApiProvider apis={[[musterApiRef, api as unknown as MusterApi]]}>
          <QueryClientProvider client={queryClient}>
            <MusterInstanceContext.Provider value={reachable}>
              {children}
            </MusterInstanceContext.Provider>
          </QueryClientProvider>
        </TestApiProvider>
      </MemoryRouter>
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

describe('McpUsageSection window', () => {
  it("reads the Usage screen's selected window", async () => {
    // QA round 1: the 7 | 30 | 90 control showed on Connectors and changed
    // nothing there.
    path = '/usage/connectors?window=7d';
    const api = {
      getMcpUsage: jest.fn().mockResolvedValue({
        available: true,
        range_hours: 168,
        step_hours: 24,
        buckets: [],
        totals: {
          calls: 0,
          errors: 0,
          error_ratio: 0,
          p95_seconds: 0,
          distinct_tools: 0,
        },
        top_tools: [],
        servers: [],
      }),
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
      <MemoryRouter initialEntries={[path]}>
        <TestApiProvider apis={[[musterApiRef, api as unknown as MusterApi]]}>
          <QueryClientProvider client={queryClient}>
            <MusterInstanceContext.Provider value={reachable}>
              {children}
            </MusterInstanceContext.Provider>
          </QueryClientProvider>
        </TestApiProvider>
      </MemoryRouter>
    );

    render(<McpUsageSection />, { wrapper });

    expect(
      await screen.findByText(
        "This covers every caller's tool calls, not only yours, over the last 7 days.",
      ),
    ).toBeInTheDocument();
    expect(api.getMcpUsage).toHaveBeenCalledWith({
      installation: 'gazelle',
      hours: 168,
    });
  });
});

describe('McpUsageSection data start', () => {
  /** Seven daily buckets, 8 to 14 Oct 2026, with calls on the last three. */
  function weekFrom(dataStart: string | undefined): McpUsage {
    return {
      available: true,
      range_hours: 168,
      step_hours: 24,
      buckets: Array.from({ length: 7 }, (_, index) => ({
        start: new Date(Date.UTC(2026, 9, 8 + index)).toISOString(),
        ok: index >= 4 ? 3 : 0,
        error: 0,
        error_result: 0,
      })),
      ...(dataStart && { data_start: dataStart }),
      totals: {
        calls: 9,
        errors: 0,
        error_ratio: 0,
        p95_seconds: 0.2,
        distinct_tools: 1,
      },
      top_tools: [],
      servers: [],
    };
  }

  async function renderWith(usage: McpUsage) {
    path = '/usage/connectors?window=7d';
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
    render(
      <MemoryRouter initialEntries={[path]}>
        <TestApiProvider apis={[[musterApiRef, api as unknown as MusterApi]]}>
          <QueryClientProvider client={queryClient}>
            <MusterInstanceContext.Provider value={reachable}>
              <McpUsageSection />
            </MusterInstanceContext.Provider>
          </QueryClientProvider>
        </TestApiProvider>
      </MemoryRouter>,
    );
    await screen.findByText('Tool calls');
  }

  it('says since when calls were recorded when that is inside the window', async () => {
    await renderWith(weekFrom('2026-10-12T00:00:00.000Z'));

    expect(
      screen.getByText(
        `Tool calls have been recorded only since ${formatDayWithYear('2026-10-12')}, so these figures cover 3 of the 7 days.`,
      ),
    ).toBeInTheDocument();
  });

  it.each([
    ['covers the whole window', '2026-10-08T00:00:00.000Z'],
    ['has no data at all', undefined],
  ])('says nothing when the data %s', async (_label, dataStart) => {
    await renderWith(weekFrom(dataStart));

    expect(screen.queryByText(/recorded only since/)).not.toBeInTheDocument();
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
      <MemoryRouter initialEntries={[path]}>
        <TestApiProvider apis={[[musterApiRef, api as unknown as MusterApi]]}>
          <QueryClientProvider client={queryClient}>
            <MusterInstanceContext.Provider value={reachable}>
              {children}
            </MusterInstanceContext.Provider>
          </QueryClientProvider>
        </TestApiProvider>
      </MemoryRouter>
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

// T22 C19: ~40px of padding per cell, and the tool names wrapped to four to
// six lines in the room four columns left them.
describe('McpUsageSection tables at phone width', () => {
  let layout: MockedLayout;
  afterEach(() => layout.restore());

  const usage: McpUsage = {
    available: true,
    range_hours: 720,
    step_hours: 24,
    buckets: [],
    totals: {
      calls: 1_000,
      errors: 3,
      error_ratio: 0.003,
      p95_seconds: 0.4,
      distinct_tools: 2,
    },
    top_tools: [
      {
        tool: 'x_kubernetes_gazelle_list_resources',
        calls: 800,
        errors: 3,
        p95_seconds: 1.2,
      },
    ],
    servers: [{ server: 'kubernetes', calls: 1_000, errors: 3 }],
  };

  async function renderSection() {
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
      <MemoryRouter initialEntries={[path]}>
        <TestApiProvider apis={[[musterApiRef, api as unknown as MusterApi]]}>
          <QueryClientProvider client={queryClient}>
            <MusterInstanceContext.Provider value={reachable}>
              {children}
            </MusterInstanceContext.Provider>
          </QueryClientProvider>
        </TestApiProvider>
      </MemoryRouter>
    );
    render(<McpUsageSection />, { wrapper });
    await screen.findByText('x_kubernetes_gazelle_list_resources');
  }

  const headers = () =>
    screen.getAllByRole('columnheader').map(cell => cell.textContent);

  it('keeps the name and Calls, with errors and p95 in words under the name', async () => {
    layout = mockPhoneLayout();
    await renderSection();

    expect(headers()).toEqual(['Top tools', 'Calls', 'Connector', 'Calls']);
    const tool = screen
      .getByText('x_kubernetes_gazelle_list_resources')
      .closest('th, td') as HTMLElement;
    expect(tool).toHaveTextContent('3 errors · p95 1.2 s');
    const connector = screen
      .getByText('kubernetes')
      .closest('th, td') as HTMLElement;
    expect(connector).toHaveTextContent('3 errors');
    expect(connector).not.toHaveTextContent('p95');
  });

  it('keeps every column on a desktop', async () => {
    layout = mockDesktopLayout();
    await renderSection();

    expect(headers()).toEqual([
      'Top tools',
      'Calls',
      'Errors',
      'p95',
      'Connector',
      'Calls',
      'Errors',
    ]);
    expect(screen.queryByText(/errors · p95/)).toBeNull();
  });
});
