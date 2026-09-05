import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { musterApiRef } from '../../apis';
import { rootRouteRef } from '../../routes';
import {
  MANAGEMENT_CLUSTER_LABEL,
  MCPServer,
  MCPServerState,
} from '../../lib/k8s';
import {
  StandardServerDisclosure,
  StandardServerDisclosureProps,
} from './StandardServerDisclosure';

function makeServer(
  family: string,
  mc: string,
  state: MCPServerState,
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name: `${family}-${mc}`,
        labels: { [MANAGEMENT_CLUSTER_LABEL]: mc },
      },
      spec: {
        type: 'streamable-http',
        family: { name: family },
        url: `https://${mc}.example/mcp`,
      },
      status: { state },
    } as never,
    'gazelle',
  );
}

// The 24 clusters of the screenshot this row was reworked for.
const FLEET = [
  'agama',
  'alba',
  'alligator',
  'anemone',
  'armadillo',
  'avocet',
  'cedar',
  'enigma',
  'ferret',
  'finch',
  'gaggle',
  'galaxy',
  'garm',
  'gazelle',
  'gerbil',
  'glean',
  'glippy',
  'graveler',
  'grizzly',
  'grouse',
  'leopard',
  'sardine',
  'tamarin',
  'wallaby',
];

/** Pills carry `title="<cluster>: <state>"`; nothing else on the row does. */
const PILL_TITLE = /^[a-z]+: /;

async function render(
  props: Pick<StandardServerDisclosureProps, 'family' | 'servers'> &
    Partial<StandardServerDisclosureProps>,
) {
  const musterApi = {
    listServers: jest.fn().mockResolvedValue({ mcpServers: [] }),
    filterTools: jest.fn().mockResolvedValue({ tools: [], total: 0 }),
    getAuthStatus: jest.fn().mockResolvedValue({ servers: [] }),
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>
        <StandardServerDisclosure
          authenticated={false}
          activeInstallation="gazelle"
          fleetClusters={FLEET}
          {...props}
        />
      </QueryClientProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/agent-platform/muster': rootRouteRef } },
  );
}

describe('StandardServerDisclosure', () => {
  it('keeps a wide family to one line: degraded clusters first, the healthy rest folded', async () => {
    const stateOf = (mc: string): MCPServerState => {
      if (mc === 'gaggle') {
        return 'Failed';
      }
      return mc === 'garm' ? 'Disconnected' : 'Connected';
    };
    await render({
      family: 'kubernetes',
      servers: FLEET.map(mc => makeServer('kubernetes', mc, stateOf(mc))),
    });

    const pills = screen.getAllByTitle(PILL_TITLE);
    expect(pills).toHaveLength(8);
    expect(pills[0]).toHaveTextContent('gaggle');
    expect(pills[0]).toHaveTextContent('Failed');
    expect(pills[1]).toHaveTextContent('garm');
    expect(pills[1]).toHaveTextContent('Disconnected');
    expect(screen.getByText('+16 more')).toBeInTheDocument();
    expect(screen.getByText('24 clusters')).toBeInTheDocument();
  });

  it('says how much of the fleet a partially rolled-out family covers, and names the gaps when expanded', async () => {
    // capi so far: the ten g-clusters only.
    const present = FLEET.filter(mc => mc.startsWith('g'));
    await render({
      family: 'capi',
      servers: present.map(mc => makeServer('capi', mc, 'Connected')),
    });

    expect(screen.getByText('10/24 clusters')).toBeInTheDocument();
    expect(screen.getAllByTitle(PILL_TITLE)).toHaveLength(8);
    expect(screen.getByText('+2 more')).toBeInTheDocument();

    await userEvent.click(screen.getByText('capi'));

    // The block lists all ten, not the collapsed row's eight.
    const block = (await screen.findByText('Management clusters'))
      .parentElement as HTMLElement;
    expect(within(block).getAllByTitle(PILL_TITLE)).toHaveLength(10);
    expect(
      within(block).getByText(
        /Deployed on 10 of 24 clusters in this installation\. Not deployed on: agama, alba, alligator, anemone, armadillo, avocet, cedar, enigma, ferret, finch, leopard, sardine, tamarin, wallaby\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Degraded clusters')).not.toBeInTheDocument();
  });

  it('lists every cluster when expanded, degraded first, with the diagnostics next to it', async () => {
    await render({
      family: 'kubernetes',
      servers: FLEET.map(mc =>
        makeServer('kubernetes', mc, mc === 'garm' ? 'Failed' : 'Connected'),
      ),
    });

    await userEvent.click(screen.getByText('kubernetes'));

    const block = (await screen.findByText('Management clusters'))
      .parentElement as HTMLElement;
    const pills = within(block).getAllByTitle(PILL_TITLE);
    expect(pills).toHaveLength(24);
    expect(pills[0]).toHaveTextContent('garm');
    expect(
      within(block).getByText(/1 cluster is degraded — details below/),
    ).toBeInTheDocument();
    expect(screen.getByText('Degraded clusters')).toBeInTheDocument();
    expect(screen.getByText('garm · Failed')).toBeInTheDocument();
  });
});
