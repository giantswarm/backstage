import { screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { musterApiRef } from '../../apis';
import {
  MANAGEMENT_CLUSTER_LABEL,
  MCPServer,
  TOOL_GROUP_LABEL,
  ToolGroup,
} from '../../lib/k8s';
import { CapabilitySurface, capabilityRows } from './CapabilitySurface';

function makeServer(
  name: string,
  family?: string,
  mc?: string,
  toolGroup?: ToolGroup,
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name,
        labels: {
          ...(mc ? { [MANAGEMENT_CLUSTER_LABEL]: mc } : {}),
          ...(toolGroup ? { [TOOL_GROUP_LABEL]: toolGroup } : {}),
        },
      },
      spec: {
        type: 'streamable-http',
        ...(family ? { family: { name: family } } : {}),
      },
      status: { state: 'Connected' },
    } as never,
    'gazelle',
  );
}

const SERVERS = [
  makeServer('kubernetes-gaggle', 'kubernetes', 'gaggle', 'infrastructure'),
  makeServer('kubernetes-garm', 'kubernetes', 'garm', 'infrastructure'),
  makeServer('pro'),
  makeServer('agent-manager', undefined, undefined, 'agent-platform'),
];

const RUNTIME = [
  { name: 'kubernetes-gaggle', toolsCount: 12, promptsCount: 1 },
  {
    name: 'kubernetes-garm',
    toolsCount: 12,
    promptsCount: 1,
    resourcesCount: 2,
  },
  { name: 'pro', toolsCount: 30, resourcesCount: 3 },
  { name: 'agent-manager', toolsCount: 7 },
];

/** The rendered rows, header included, as arrays of cell text. */
function tableText(table: HTMLElement): string[][] {
  return within(table)
    .getAllByRole('row')
    .map(row =>
      Array.from(row.querySelectorAll('th, td')).map(
        cell => cell.textContent ?? '',
      ),
    );
}

describe('capabilityRows', () => {
  it('groups by tool group in display order, counts a family’s tools once, adds up its resources and prompts, and closes Agent Platform with muster core', () => {
    expect(capabilityRows(SERVERS, RUNTIME, 41)).toEqual([
      {
        id: 'server:agent-manager',
        name: 'agent-manager',
        kind: 'server',
        group: 'agent-platform',
        instances: 1,
        tools: 7,
      },
      {
        id: 'core',
        name: 'muster',
        kind: 'core',
        group: 'agent-platform',
        instances: 1,
        tools: 41,
      },
      {
        id: 'family:kubernetes',
        name: 'kubernetes',
        kind: 'family',
        group: 'infrastructure',
        instances: 2,
        tools: 12,
        resources: 2,
        prompts: 2,
      },
      {
        id: 'server:pro',
        name: 'pro',
        kind: 'server',
        group: 'registered',
        instances: 1,
        tools: 30,
        resources: 3,
      },
    ]);
  });

  it('lists everything but muster core under Registered servers when nothing is labelled', () => {
    const rows = capabilityRows(
      [
        makeServer('kubernetes-gaggle', 'kubernetes', 'gaggle'),
        makeServer('pro'),
      ],
      RUNTIME,
      41,
    );

    expect(rows.map(row => [row.group, row.name])).toEqual([
      ['agent-platform', 'muster'],
      ['registered', 'kubernetes'],
      ['registered', 'pro'],
    ]);
  });

  it('leaves a row the runtime does not report as unknown rather than zero', () => {
    const rows = capabilityRows(SERVERS, [], undefined);
    const kubernetes = rows.find(row => row.name === 'kubernetes');
    const pro = rows.find(row => row.name === 'pro');

    expect(kubernetes?.tools).toBeUndefined();
    expect(pro?.tools).toBeUndefined();
  });
});

describe('CapabilitySurface', () => {
  it('renders one row per server in tool group order, with the group, the kind and the instance count each in a column', async () => {
    const musterApi = {
      listServers: jest.fn().mockResolvedValue({ mcpServers: RUNTIME }),
      listCoreTools: jest.fn().mockResolvedValue({
        total: 41,
        filtered_count: 41,
        truncated: false,
        tools: [],
      }),
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await renderInTestApp(
      <TestApiProvider apis={[[musterApiRef, musterApi]]}>
        <QueryClientProvider client={queryClient}>
          <CapabilitySurface servers={SERVERS} installation="gazelle" />
        </QueryClientProvider>
      </TestApiProvider>,
    );

    // bui's Table drops the `aria-label` it is given and renders react-aria's
    // `grid`, so it is found by role alone -- there is one table here.
    const table = await screen.findByRole('grid');
    expect(await screen.findByText('agent-manager')).toBeInTheDocument();

    expect(tableText(table)).toEqual([
      ['Group', 'Server', 'Kind', 'Instances', 'Tools', 'Resources', 'Prompts'],
      ['Agent Platform', 'agent-manager', 'server', '1', '7', '—', '—'],
      ['Agent Platform', 'muster', 'core', '1', '41', '—', '—'],
      ['Infrastructure', 'kubernetes', 'family', '2', '12', '2', '2'],
      ['Registered servers', 'pro', 'server', '1', '30', '3', '—'],
    ]);
    expect(musterApi.listServers).toHaveBeenCalledWith('gazelle');
    expect(musterApi.listCoreTools).toHaveBeenCalledWith('gazelle');
  });
});
