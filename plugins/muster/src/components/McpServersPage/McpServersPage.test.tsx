import { screen, within } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { rootRouteRef } from '../../routes';
import {
  MANAGEMENT_CLUSTER_LABEL,
  MCPServer,
  TOOL_GROUP_LABEL,
  ToolGroup,
} from '../../lib/k8s';
import { McpServersPage } from './McpServersPage';

// The page under test is the partition into sections; the rows themselves
// (per-cluster pills, runtime counts, mutation actions) have their own tests
// and pull in the muster API, so they are stubbed to a marker each.
jest.mock('./StandardServerDisclosure', () => ({
  StandardServerDisclosure: ({
    family,
    servers,
  }: {
    family: string;
    servers: MCPServer[];
  }) => (
    <div data-testid="server-row">
      family:{family} ({servers.length})
    </div>
  ),
}));
jest.mock('./IntegrationServerDisclosure', () => ({
  IntegrationServerDisclosure: ({ server }: { server: MCPServer }) => (
    <div data-testid="server-row">server:{server.getName()}</div>
  ),
}));
jest.mock('./ServerMutationActions', () => ({
  AddAdHocServerButton: () => <button type="button">Add ad-hoc server</button>,
}));

let mcpServers: MCPServer[] = [];

jest.mock('../MusterInstanceProvider', () => ({
  useMusterInstance: () => ({
    installations: ['gazelle'],
    isLoadingInstallations: false,
    activeInstallation: 'gazelle',
    scope: 'gazelle',
    homeInstallation: 'gazelle',
    isSingleInstallation: false,
    activeInstallationInfo: {
      name: 'gazelle',
      endpoint: 'https://muster.gazelle.example.com/mcp',
      requiresAuth: true,
    },
    setActiveInstallation: jest.fn(),
    mcpServers,
    workflows: [],
    isLoading: false,
    dataUpdatedAt: Date.now(),
    isRefreshing: false,
    retry: jest.fn(),
  }),
  // Unauthenticated: the core row shows its gate instead of loading the core
  // families, which keeps the page free of muster API calls here.
  useMusterSession: () => ({
    authenticated: false,
    connecting: false,
    connect: jest.fn(),
  }),
}));

function makeServer(
  name: string,
  options: { family?: string; mc?: string; toolGroup?: ToolGroup } = {},
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name,
        labels: {
          ...(options.mc ? { [MANAGEMENT_CLUSTER_LABEL]: options.mc } : {}),
          ...(options.toolGroup
            ? { [TOOL_GROUP_LABEL]: options.toolGroup }
            : {}),
        },
      },
      spec: {
        type: 'streamable-http',
        ...(options.family ? { family: { name: options.family } } : {}),
      },
      status: { state: 'Connected' },
    } as never,
    'gazelle',
  );
}

async function renderPage(servers: MCPServer[]) {
  mcpServers = servers;
  return renderInTestApp(<McpServersPage />, {
    mountedRoutes: { '/agent-platform/muster': rootRouteRef },
  });
}

/** The section (aria-labelled by its tool-group title) and its row markers. */
function section(title: string) {
  const region = screen.getByRole('region', { name: title });
  return {
    region,
    rows: within(region)
      .queryAllByTestId('server-row')
      .map(el => el.textContent),
  };
}

/** Asserts the elements appear in the document in the given order. */
function expectDocumentOrder(...elements: HTMLElement[]) {
  for (let i = 1; i < elements.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    const precedes = Boolean(
      elements[i - 1].compareDocumentPosition(elements[i]) &
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(precedes).toBe(true);
  }
}

describe('McpServersPage', () => {
  // The lab's fake fleet once its charts carry the label: the two managers
  // declare agent-platform, the federated families infrastructure, and the
  // installation's own registrations nothing.
  const labelled = () => [
    makeServer('pro'),
    makeServer('model-manager', { toolGroup: 'agent-platform' }),
    makeServer('kubernetes-beta', {
      family: 'kubernetes',
      mc: 'beta',
      toolGroup: 'infrastructure',
    }),
    makeServer('kubernetes-alpha', {
      family: 'kubernetes',
      mc: 'alpha',
      toolGroup: 'infrastructure',
    }),
    makeServer('prometheus-alpha', {
      family: 'prometheus',
      mc: 'alpha',
      toolGroup: 'infrastructure',
    }),
    makeServer('agent-manager', { toolGroup: 'agent-platform' }),
    makeServer('lab-oauth-fixture'),
  ];

  it('renders the three tool groups in order with the labelled membership, muster core last under Agent Platform', async () => {
    await renderPage(labelled());

    const agentPlatform = section('Agent Platform');
    const infrastructure = section('Infrastructure');
    const registered = section('Registered servers');
    expectDocumentOrder(
      agentPlatform.region,
      infrastructure.region,
      registered.region,
    );

    expect(agentPlatform.rows).toEqual([
      'server:agent-manager',
      'server:model-manager',
    ]);
    // muster core closes the Agent Platform group, after the managers.
    const core = within(agentPlatform.region).getByText('core / control plane');
    expectDocumentOrder(
      within(agentPlatform.region).getByText('server:model-manager'),
      core,
    );

    expect(infrastructure.rows).toEqual([
      'family:kubernetes (2)',
      'family:prometheus (1)',
    ]);
    expect(
      within(infrastructure.region).getByText('2 families across 2 clusters.'),
    ).toBeInTheDocument();

    expect(registered.rows).toEqual(['server:lab-oauth-fixture', 'server:pro']);
    // The ad-hoc registration action sits with the servers it creates.
    expect(
      within(registered.region).getByRole('button', {
        name: 'Add ad-hoc server',
      }),
    ).toBeInTheDocument();
    expect(
      within(agentPlatform.region).queryByRole('button', {
        name: 'Add ad-hoc server',
      }),
    ).not.toBeInTheDocument();

    // Each section explains its tier in one line.
    expect(
      within(agentPlatform.region).getByText(
        /platform's own management surface/,
      ),
    ).toBeInTheDocument();
    expect(
      within(infrastructure.region).getByText(
        /infrastructure the platform runs on/,
      ),
    ).toBeInTheDocument();
    expect(
      within(registered.region).getByText(
        /this installation or its users registered/,
      ),
    ).toBeInTheDocument();

    // The old topology vocabulary is gone.
    expect(screen.queryByText(/Standard servers/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Integration servers/)).not.toBeInTheDocument();
  });

  it('lists every server under Registered servers when no CR carries the label, and says why the other groups are empty', async () => {
    // An installation whose charts have not rolled the label yet -- one long
    // list, never an empty or broken page.
    await renderPage([
      makeServer('mcp-prometheus', { mc: 'agentlab' }),
      makeServer('agent-manager'),
      makeServer('kubernetes-alpha', { family: 'kubernetes', mc: 'alpha' }),
      makeServer('model-manager'),
    ]);

    const agentPlatform = section('Agent Platform');
    const infrastructure = section('Infrastructure');
    const registered = section('Registered servers');
    expectDocumentOrder(
      agentPlatform.region,
      infrastructure.region,
      registered.region,
    );

    // Agent Platform still carries muster core; it is never empty.
    expect(agentPlatform.rows).toEqual([]);
    expect(
      within(agentPlatform.region).getByText('core / control plane'),
    ).toBeInTheDocument();

    expect(infrastructure.rows).toEqual([]);
    expect(
      within(infrastructure.region).getByText(
        /No servers declare the Infrastructure tool group in this installation\. Servers whose charts do not carry the tool-group label yet are listed under Registered servers\./,
      ),
    ).toBeInTheDocument();

    expect(registered.rows).toEqual([
      'family:kubernetes (1)',
      'server:agent-manager',
      'server:mcp-prometheus',
      'server:model-manager',
    ]);
  });

  it('shows the empty state rather than sections when the installation has no MCPServer CRs', async () => {
    await renderPage([]);

    expect(screen.getByText('No MCP servers')).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Agent Platform' }),
    ).not.toBeInTheDocument();
  });
});
