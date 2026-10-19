import { ReactNode } from 'react';
import { screen, within } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';

import type { McpUsage, ToolSummary } from '../../../apis';
import { MCPServer } from '../../../lib/k8s';
import type { ServerPageRow } from '../../../lib/serverGrouping';
import {
  mcpServersRouteRef,
  usageConnectorsExternalRouteRef,
} from '../../../routes';
import type { ServerTools } from '../../ServerPage/useServerPageData';
import type { ConnectorUsage } from '../useConnectorUsage';
import {
  ConnectorUsageTab,
  instanceUsageRows,
  toolUsageRows,
  toolsUsedLine,
} from './ConnectorUsageTab';

jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  // recharts needs layout jsdom will not do; record what the chart is given.
  StackedBarChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="chart" data-buckets={data.length} />
  ),
}));

function makeServer(name: string, family?: string): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name, namespace: 'muster' },
      spec: {
        type: 'streamable-http',
        url: `https://${name}.example.test/mcp`,
        ...(family
          ? { family: { name: family, instanceArg: 'management_cluster' } }
          : {}),
      },
      status: { state: 'Connected' },
    } as never,
    'gazelle',
  );
}

const KAGI: ServerPageRow = { kind: 'server', server: makeServer('kagi') };
const KUBERNETES: ServerPageRow = {
  kind: 'family',
  family: 'kubernetes',
  servers: [
    makeServer('gazelle-mcp-kubernetes', 'kubernetes'),
    makeServer('graveler-mcp-kubernetes', 'kubernetes'),
  ],
};

function usage(overrides: Partial<McpUsage> = {}): McpUsage {
  return {
    available: true,
    range_hours: 720,
    step_hours: 24,
    buckets: [
      { start: '2026-10-18T00:00:00.000Z', ok: 30, error: 1, error_result: 2 },
    ],
    totals: {
      calls: 33,
      errors: 3,
      error_ratio: 3 / 33,
      p95_seconds: 1.2,
      distinct_tools: 1,
    },
    top_tools: [
      { tool: 'x_kagi_search', calls: 33, errors: 3, p95_seconds: 1.2 },
    ],
    servers: [{ server: 'kagi', calls: 33, errors: 3, p95_seconds: 1.2 }],
    ...overrides,
  };
}

function tools(names: string[] | undefined): ServerTools {
  return {
    tools: names?.map(name => ({ name }) as ToolSummary),
    truncated: false,
    isLoading: false,
    shortName: name => name.replace(/^x_[a-z]+_/, ''),
  };
}

async function renderTab({
  row = KAGI,
  server = 'kagi',
  read = { usage: usage(), isLoading: false },
  offered = ['x_kagi_search', 'x_kagi_extract'],
  sessionGate,
}: {
  row?: ServerPageRow;
  server?: string;
  read?: ConnectorUsage;
  offered?: string[] | undefined;
  sessionGate?: ReactNode;
} = {}) {
  await renderInTestApp(
    <ConnectorUsageTab
      row={row}
      server={server}
      installation="gazelle"
      usage={read}
      tools={tools(offered)}
      sessionGate={sessionGate}
    />,
    {
      mountedRoutes: {
        '/customize/connectors': mcpServersRouteRef,
        '/usage/connectors': usageConnectorsExternalRouteRef,
      },
    },
  );
}

/** A stat tile's value, found by its label. */
function stat(label: string): string | null {
  const tile = screen.getByText(label).closest('[class*="root"]');
  return tile?.textContent?.replace(label, '') ?? null;
}

describe('toolUsageRows', () => {
  it('lists every offered tool, never called ones with zeros, busiest first', () => {
    const rows = toolUsageRows(usage(), ['x_kagi_extract', 'x_kagi_search']);

    expect(rows).toEqual([
      {
        id: 'x_kagi_search',
        calls: 33,
        errors: 3,
        p95_seconds: 1.2,
        offered: true,
      },
      {
        id: 'x_kagi_extract',
        calls: 0,
        errors: 0,
        p95_seconds: null,
        offered: true,
      },
    ]);
  });

  it('keeps a tool called in the window that is no longer offered', () => {
    const rows = toolUsageRows(usage(), ['x_kagi_extract']);

    expect(rows.map(row => [row.id, row.offered])).toEqual([
      ['x_kagi_search', false],
      ['x_kagi_extract', true],
    ]);
  });
});

describe('instanceUsageRows', () => {
  it('lists every instance of the family, idle ones with zeros', () => {
    const rows = instanceUsageRows(
      usage({
        servers: [
          {
            server: 'graveler-mcp-kubernetes',
            calls: 12,
            errors: 0,
            p95_seconds: 0.2,
          },
        ],
      }),
      ['gazelle-mcp-kubernetes', 'graveler-mcp-kubernetes'],
    );

    expect(rows).toEqual([
      {
        id: 'graveler-mcp-kubernetes',
        calls: 12,
        errors: 0,
        p95_seconds: 0.2,
      },
      { id: 'gazelle-mcp-kubernetes', calls: 0, errors: 0, p95_seconds: null },
    ]);
  });
});

describe('toolsUsedLine', () => {
  it('counts the offered tools called, of those offered', () => {
    expect(
      toolsUsedLine(
        toolUsageRows(usage(), ['x_kagi_search', 'x_a', 'x_b']),
        true,
      ),
    ).toBe('1 of 3');
  });

  it('does not count a call estimate that rounds to none', () => {
    const rows = toolUsageRows(
      usage({
        top_tools: [
          { tool: 'x_kagi_search', calls: 0.3, errors: 0, p95_seconds: null },
        ],
      }),
      ['x_kagi_search'],
    );
    expect(toolsUsedLine(rows, true)).toBe('0 of 1');
  });

  it('is just the count where the tools could not be listed', () => {
    expect(toolsUsedLine(toolUsageRows(usage(), undefined), false)).toBe('1');
  });
});

describe('ConnectorUsageTab', () => {
  let layout: MockedLayout | undefined;
  afterEach(() => {
    layout?.restore();
    layout = undefined;
  });

  it('states the window, then the tiles, the chart, the tools and the way to Usage', async () => {
    await renderTab();

    expect(
      screen.getByText(
        "Every caller's tool calls to this connector over the last 30 days on gazelle.",
      ),
    ).toBeInTheDocument();
    expect(stat('Tool calls')).toContain('33');
    // 3 of 33 is 9%: above 5%, so amber.
    expect(stat('Error ratio')).toContain('9%');
    expect(stat('p95 latency')).toContain('1.2 s');
    expect(stat('Tools used')).toContain('1 of 2');
    expect(screen.getByTestId('chart')).toHaveAttribute('data-buckets', '1');

    const table = screen.getByRole('grid');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map(cell => cell.textContent),
    ).toEqual(['Tool', 'Calls', 'Errors', 'p95']);
    // Each offered tool links to its page; the idle one is listed too.
    expect(within(table).getByRole('link', { name: 'search' })).toHaveAttribute(
      'href',
      '/customize/connectors/gazelle/kagi/tools/x_kagi_search',
    );
    expect(within(table).getByRole('link', { name: 'extract' })).toBeVisible();

    expect(
      screen.getByText(
        'Counted where muster dispatches each call, so a call through call_tool counts for the tool it ran.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Usage' })).toHaveAttribute(
      'href',
      '/usage/connectors?installation=gazelle',
    );
  });

  it('names a tool no longer offered without a link', async () => {
    await renderTab({ offered: ['x_kagi_extract'] });

    expect(screen.getByText('search')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'search' })).toBeNull();
  });

  it("adds a family's instances, each with its calls", async () => {
    await renderTab({
      row: KUBERNETES,
      server: 'kubernetes',
      offered: ['x_kubernetes_list'],
      read: {
        isLoading: false,
        usage: usage({
          top_tools: [
            { tool: 'x_kubernetes_list', calls: 33, errors: 3, p95_seconds: 1 },
          ],
          servers: [
            {
              server: 'graveler-mcp-kubernetes',
              calls: 33,
              errors: 3,
              p95_seconds: 1,
            },
          ],
        }),
      },
    });

    const [, instances] = screen.getAllByRole('grid');
    expect(
      within(instances)
        .getAllByRole('columnheader')
        .map(cell => cell.textContent),
    ).toEqual(['Instance', 'Calls', 'Errors', 'p95']);
    expect(
      within(instances)
        .getAllByRole('rowheader')
        .map(cell => cell.textContent),
    ).toEqual(['graveler-mcp-kubernetes', 'gazelle-mcp-kubernetes']);
  });

  it('has no instances table for a single connector', async () => {
    await renderTab();

    expect(screen.getAllByRole('grid')).toHaveLength(1);
  });

  it('pages a long tool list', async () => {
    const offered = Array.from(
      { length: 25 },
      (_, index) => `x_kagi_tool_${String(index).padStart(2, '0')}`,
    );
    await renderTab({ offered });

    // 25 offered and the one called: 20 shown, a click for the rest.
    expect(within(screen.getByRole('grid')).getAllByRole('row')).toHaveLength(
      21,
    );
    expect(
      screen.getByRole('button', { name: 'Show 6 more tools' }),
    ).toBeInTheDocument();
  });

  it('says plainly when nothing called the connector, with no chart or table', async () => {
    await renderTab({
      read: {
        isLoading: false,
        usage: usage({
          buckets: [],
          totals: {
            calls: 0,
            errors: 0,
            error_ratio: null,
            p95_seconds: null,
            distinct_tools: 0,
          },
          top_tools: [],
          servers: [],
        }),
      },
    });

    expect(
      screen.getByText('No tool calls in the last 30 days'),
    ).toBeInTheDocument();
    expect(stat('Tool calls')).toContain('0');
    expect(stat('Error ratio')).toContain('—');
    expect(stat('Tools used')).toContain('0 of 2');
    expect(screen.queryByTestId('chart')).toBeNull();
    expect(screen.queryByRole('grid')).toBeNull();
    expect(screen.getByRole('link', { name: 'Open in Usage' })).toBeVisible();
  });

  it('says since when calls were recorded when that is inside the window', async () => {
    const buckets = Array.from({ length: 30 }, (_, index) => ({
      start: new Date(Date.UTC(2026, 8, 20 + index)).toISOString(),
      ok: index >= 26 ? 1 : 0,
      error: 0,
      error_result: 0,
    }));
    await renderTab({
      read: {
        isLoading: false,
        usage: usage({ buckets, data_start: '2026-10-16T00:00:00.000Z' }),
      },
    });

    expect(
      screen.getByText(/Tool calls have been recorded only since/),
    ).toHaveTextContent(/so these figures cover 4 of the 30 days\./);
  });

  it('shows the session gate in place of the figures', async () => {
    await renderTab({ sessionGate: <p>Needs a session.</p> });

    expect(screen.getByText('Needs a session.')).toBeInTheDocument();
    expect(screen.queryByText(/Every caller/)).toBeNull();
  });

  it('says what it reads while it reads', async () => {
    await renderTab({ read: { isLoading: true } });

    expect(
      await screen.findByText("Reading this connector's usage…"),
    ).toBeInTheDocument();
  });

  it('says it could not read the usage, and why', async () => {
    await renderTab({
      read: { isLoading: false, error: new Error('muster said no') },
    });

    expect(
      screen.getByText("Could not read this connector's usage"),
    ).toBeInTheDocument();
    expect(screen.getByText('muster said no')).toBeInTheDocument();
  });

  it('says why an environment has no usage figures', async () => {
    await renderTab({
      read: {
        isLoading: false,
        usage: usage({ available: false, reason: 'No prometheus here.' }),
      },
    });

    expect(
      screen.getByText(
        'Usage metrics are not available for this environment: No prometheus here.',
      ),
    ).toBeInTheDocument();
  });

  it('keeps the name and Calls at phone width, the rest under the name', async () => {
    layout = mockPhoneLayout();
    await renderTab();

    const table = screen.getByRole('grid');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map(cell => cell.textContent),
    ).toEqual(['Tool', 'Calls']);
    expect(
      within(table).getByRole('link', { name: 'search' }).closest('th, td'),
    ).toHaveTextContent('3 errors · p95 1.2 s');
  });

  it('keeps every column on a desktop', async () => {
    layout = mockDesktopLayout();
    await renderTab();

    expect(
      within(screen.getByRole('grid'))
        .getAllByRole('columnheader')
        .map(cell => cell.textContent),
    ).toEqual(['Tool', 'Calls', 'Errors', 'p95']);
  });
});
