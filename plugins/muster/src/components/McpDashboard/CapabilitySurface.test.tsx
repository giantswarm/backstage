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
import {
  CapabilitySurface,
  capabilityRows,
  capabilityRowsByGroup,
} from './CapabilitySurface';

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

describe('capabilityRows', () => {
  it('groups by tool group in display order, counts a family’s tools once, adds up its resources and prompts, and closes Agent Platform with muster core', () => {
    expect(capabilityRows(SERVERS, RUNTIME, 41)).toEqual([
      {
        key: 'server:agent-manager',
        name: 'agent-manager',
        kind: 'server',
        group: 'agent-platform',
        instances: 1,
        tools: 7,
      },
      {
        key: 'core',
        name: 'muster',
        kind: 'core',
        group: 'agent-platform',
        instances: 1,
        tools: 41,
      },
      {
        key: 'family:kubernetes',
        name: 'kubernetes',
        kind: 'family',
        group: 'infrastructure',
        instances: 2,
        tools: 12,
        resources: 2,
        prompts: 2,
      },
      {
        key: 'server:pro',
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
    expect(capabilityRowsByGroup(rows).map(entry => entry.group)).toEqual([
      'agent-platform',
      'registered',
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
  it('renders the tool groups in order, one row per server, muster core last under Agent Platform', async () => {
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

    const table = await screen.findByRole('table', {
      name: 'Capability surface',
    });
    const rows = within(table).getAllByRole('row').slice(1);
    // Three group headings interleaved with four server rows.
    expect(
      rows.map(row => within(row).getAllByRole('cell')[0].textContent),
    ).toEqual([
      'Agent Platform',
      'agent-managerserver',
      'mustercore',
      'Infrastructure',
      'kubernetesfamily · 2 instances',
      'Registered servers',
      'proserver',
    ]);
    expect(
      within(rows[4])
        .getAllByRole('cell')
        .map(c => c.textContent),
    ).toEqual(['kubernetesfamily · 2 instances', '12', '2', '2']);
    expect(
      within(rows[2])
        .getAllByRole('cell')
        .map(c => c.textContent),
    ).toEqual(['mustercore', '41', '—', '—']);
    expect(musterApi.listServers).toHaveBeenCalledWith('gazelle');
    expect(musterApi.listCoreTools).toHaveBeenCalledWith('gazelle');
  });
});
