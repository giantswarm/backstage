import { screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';

import { musterApiRef, type McpUsage } from '../../../apis';
import { MCPServer } from '../../../lib/k8s';
import type { ServerPageRow } from '../../../lib/serverGrouping';
import { ToolUsageTab } from './ToolUsageTab';

jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  // recharts needs layout jsdom will not do; record what the chart is given.
  StackedBarChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="chart" data-buckets={data.length} />
  ),
}));

function makeServer(name: string): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name, namespace: 'muster' },
      spec: {
        type: 'streamable-http',
        url: `https://${name}.example.test/mcp`,
        family: { name: 'kubernetes', instanceArg: 'management_cluster' },
      },
      status: { state: 'Connected' },
    } as never,
    'gazelle',
  );
}

const KUBERNETES: ServerPageRow = {
  kind: 'family',
  family: 'kubernetes',
  servers: [
    makeServer('gazelle-mcp-kubernetes'),
    makeServer('graveler-mcp-kubernetes'),
  ],
};

const USAGE: McpUsage = {
  available: true,
  range_hours: 720,
  step_hours: 24,
  buckets: [
    { start: '2026-10-17T00:00:00.000Z', ok: 10, error: 0, error_result: 0 },
    { start: '2026-10-18T00:00:00.000Z', ok: 30, error: 1, error_result: 2 },
  ],
  totals: {
    calls: 43,
    errors: 3,
    error_ratio: 3 / 43,
    p95_seconds: 1.2,
    distinct_tools: 1,
  },
  top_tools: [
    { tool: 'x_kubernetes_list', calls: 43, errors: 3, p95_seconds: 1.2 },
  ],
  servers: [
    {
      server: 'gazelle-mcp-kubernetes',
      calls: 43,
      errors: 3,
      p95_seconds: 1.2,
    },
  ],
};

async function renderTab() {
  const api = { getMcpUsage: jest.fn(async () => USAGE) };
  await renderInTestApp(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ToolUsageTab
        name="x_kubernetes_list"
        row={KUBERNETES}
        installation="gazelle"
        connectorName="Kubernetes"
        connectorUsageHref="/customize/connectors/gazelle/kubernetes/usage"
      />
    </QueryClientProvider>,
    { apis: [[musterApiRef, api as never]] },
  );
  return api;
}

describe('ToolUsageTab', () => {
  it("reads one tool of a family's instances and splits it by instance", async () => {
    const api = await renderTab();

    expect(await screen.findByText('Tool calls')).toBeInTheDocument();
    expect(api.getMcpUsage).toHaveBeenCalledWith({
      installation: 'gazelle',
      hours: 720,
      servers: ['gazelle-mcp-kubernetes', 'graveler-mcp-kubernetes'],
      tool: 'x_kubernetes_list',
    });
    expect(screen.getByTestId('chart')).toHaveAttribute('data-buckets', '2');

    const table = screen.getByRole('grid');
    // Every instance, the idle one with zeros, busiest first.
    expect(
      within(table)
        .getAllByRole('rowheader')
        .map(cell => cell.textContent),
    ).toEqual(['gazelle-mcp-kubernetes', 'graveler-mcp-kubernetes']);
    expect(
      screen.getByRole('link', { name: 'All usage of Kubernetes' }),
    ).toHaveAttribute('href', '/customize/connectors/gazelle/kubernetes/usage');
  });

  describe('at phone width', () => {
    let layout: MockedLayout;
    beforeEach(() => {
      layout = mockPhoneLayout();
    });
    afterEach(() => layout.restore());

    it('keeps every figure', async () => {
      await renderTab();

      expect(await screen.findByText('Tool calls')).toBeInTheDocument();
      expect(screen.getByText('Error ratio')).toBeInTheDocument();
      expect(screen.getByText('p95 latency')).toBeInTheDocument();
      expect(screen.getByRole('grid')).toBeInTheDocument();
    });
  });
});
