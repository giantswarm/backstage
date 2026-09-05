import { screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { musterApiRef } from '../../apis';
import { MANAGEMENT_CLUSTER_LABEL, MCPServer } from '../../lib/k8s';
import { CapabilitySurface, capabilityRows } from './CapabilitySurface';

function makeServer(name: string, family?: string, mc?: string): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name,
        labels: mc ? { [MANAGEMENT_CLUSTER_LABEL]: mc } : {},
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
  makeServer('kubernetes-gaggle', 'kubernetes', 'gaggle'),
  makeServer('kubernetes-garm', 'kubernetes', 'garm'),
  makeServer('pro'),
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
];

describe('capabilityRows', () => {
  it('counts a family’s tools once, adds up its resources and prompts, and appends muster core', () => {
    expect(capabilityRows(SERVERS, RUNTIME, 41)).toEqual([
      {
        key: 'family:kubernetes',
        name: 'kubernetes',
        kind: 'standard server',
        instances: 2,
        tools: 12,
        resources: 2,
        prompts: 2,
      },
      {
        key: 'server:pro',
        name: 'pro',
        kind: 'integration server',
        instances: 1,
        tools: 30,
        resources: 3,
      },
      { key: 'core', name: 'muster', kind: 'core', instances: 1, tools: 41 },
    ]);
  });

  it('leaves a group the runtime does not report as unknown rather than zero', () => {
    const [kubernetes, pro] = capabilityRows(SERVERS, [], undefined);

    expect(kubernetes.tools).toBeUndefined();
    expect(pro.tools).toBeUndefined();
  });
});

describe('CapabilitySurface', () => {
  it('renders one row per server group plus muster core', async () => {
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
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('kubernetes');
    expect(rows[0]).toHaveTextContent('2 instances');
    expect(
      within(rows[0])
        .getAllByRole('cell')
        .map(c => c.textContent),
    ).toEqual(['kubernetesstandard server · 2 instances', '12', '2', '2']);
    expect(
      within(rows[2])
        .getAllByRole('cell')
        .map(c => c.textContent),
    ).toEqual(['mustercore', '41', '—', '—']);
    expect(musterApi.listServers).toHaveBeenCalledWith('gazelle');
    expect(musterApi.listCoreTools).toHaveBeenCalledWith('gazelle');
  });
});
