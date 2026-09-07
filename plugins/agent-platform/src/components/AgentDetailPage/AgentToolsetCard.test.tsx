import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import {
  MCPServer,
  musterApiRef,
  TOOL_GROUP_LABEL,
  type FilterToolsOptions,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';

import { agentsRouteRef } from '../../routes';
import { AgentToolsetCard } from './AgentToolsetCard';

const mockUseResources = jest.fn();
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: (...args: unknown[]) => mockUseResources(...args),
}));

function mcpServer(
  name: string,
  spec: Record<string, unknown>,
  labels: Record<string, string> = {},
  state = 'Connected',
) {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name, namespace: 'agent-platform', labels },
      spec: { type: 'streamable-http', ...spec },
      status: { state },
    } as never,
    'gazelle',
  );
}

const SERVER_CRS = [
  mcpServer(
    'kubernetes-gazelle',
    { family: { name: 'kubernetes', instanceArg: 'management_cluster' } },
    { [TOOL_GROUP_LABEL]: 'infrastructure' },
  ),
  mcpServer('pro', { auth: { type: 'oauth' } }, {}, 'Auth Required'),
];

type ToolEntry = {
  mcpServer: { name: string; namespace?: string };
  headersFrom?: { name: string; value: string }[];
};

function makeAgent(tools: ToolEntry[]) {
  return new Agent(
    {
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'Agent',
      metadata: { name: 'pr-reviewer', namespace: 'kagent' },
      spec: {
        type: 'Declarative',
        declarative: {
          modelConfig: 'opus',
          tools: tools.map(tool => ({ type: 'McpServer', ...tool })),
        },
      },
    } as never,
    'gazelle',
  );
}

const GATEWAY = { name: 'muster', namespace: 'agent-platform' };

function withToolset(toolset: string) {
  return makeAgent([
    {
      mcpServer: GATEWAY,
      headersFrom: [{ name: 'X-Muster-Toolset', value: toolset }],
    },
  ]);
}

const RESOLVED = [
  {
    name: 'x_kubernetes_get_pods',
    summary: 'List pods',
    server: 'kubernetes',
    kind: 'tool' as const,
    annotations: { readOnlyHint: true },
  },
  {
    name: 'workflow_incident-triage',
    kind: 'workflow' as const,
    annotations: { readOnlyHint: true },
  },
];

function makeApi(
  answer: (options: FilterToolsOptions) => unknown,
  signedInToPro = false,
) {
  const filterTools = jest.fn(async (options: FilterToolsOptions = {}) =>
    answer(options),
  );
  return {
    api: {
      filterTools,
      listTools: async () => ({
        tools: RESOLVED,
        servers_requiring_auth: signedInToPro
          ? []
          : [
              {
                name: 'pro',
                status: 'auth_required',
                auth_tool: 'core_auth_login',
              },
            ],
      }),
      getAuthStatus: async () => ({
        servers: [
          {
            name: 'pro',
            status: 'auth_required',
            auth_tool: 'core_auth_login',
          },
        ],
      }),
      signInServer: jest.fn(),
      signOutServer: jest.fn(),
    } as unknown as MusterApi,
    filterTools,
  };
}

const resolvedAnswer =
  (unmatched: string[] = []) =>
  (options: FilterToolsOptions) => ({
    total: RESOLVED.length,
    filtered_count: RESOLVED.length,
    truncated: false,
    tools: RESOLVED,
    toolset: options.toolset,
    toolset_unmatched: unmatched,
  });

async function renderCard(agent: Agent, api?: MusterApi) {
  mockUseResources.mockImplementation(() => ({
    resources: SERVER_CRS,
    isLoading: false,
    errors: [],
  }));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree = (
    <QueryClientProvider client={queryClient}>
      <AgentToolsetCard agent={agent} />
    </QueryClientProvider>
  );
  return renderInTestApp(
    api ? (
      <TestApiProvider apis={[[musterApiRef, api]]}>{tree}</TestApiProvider>
    ) : (
      tree
    ),
    { mountedRoutes: { '/agent-platform/agents': agentsRouteRef } },
  );
}

const card = () =>
  screen
    .getByRole('heading', { name: 'Toolset' })
    .closest('article, div, section')!.parentElement as HTMLElement;

describe('AgentToolsetCard', () => {
  beforeEach(() => mockUseResources.mockReset());

  it('labels an agent without a toolset as implicit full access', async () => {
    const { api, filterTools } = makeApi(resolvedAnswer());
    await renderCard(makeAgent([{ mcpServer: GATEWAY }]), api);

    expect(screen.getByText('Implicit full access')).toBeInTheDocument();
    expect(screen.getByText(/declares no toolset/)).toBeInTheDocument();
    // Nothing to resolve.
    expect(filterTools).not.toHaveBeenCalled();
  });

  it('labels an agent with no gateway entry as No tools', async () => {
    const { api } = makeApi(resolvedAnswer());
    await renderCard(makeAgent([{ mcpServer: { name: 'grafana' } }]), api);

    expect(screen.getByText('No tools')).toBeInTheDocument();
    expect(
      screen.getByText(/what a toolset of preset:none renders to/),
    ).toBeInTheDocument();
  });

  it('labels the none preset as No tools without asking muster', async () => {
    const { api, filterTools } = makeApi(resolvedAnswer());
    await renderCard(withToolset('preset:none'), api);

    expect(screen.getByText('No tools')).toBeInTheDocument();
    expect(screen.getByText('preset:none')).toBeInTheDocument();
    expect(filterTools).not.toHaveBeenCalled();
  });

  it('labels the full preset loudly as full gateway access', async () => {
    const { api } = makeApi(resolvedAnswer());
    await renderCard(withToolset('preset:full'), api);

    expect(screen.getByText('Full gateway access')).toBeInTheDocument();
    expect(
      screen.getByText(/platform administration included/),
    ).toBeInTheDocument();
  });

  it('shows the declared selectors and what they resolve to for the viewer, per group', async () => {
    const { api, filterTools } = makeApi(resolvedAnswer());
    await renderCard(
      withToolset('preset:read-only,workflow:incident-triage'),
      api,
    );

    const declared = screen.getByRole('list', { name: 'Declared toolset' });
    expect(
      within(declared)
        .getAllByRole('listitem')
        .map(item => item.textContent),
    ).toEqual(['preset:read-only', 'workflow:incident-triage']);

    expect(
      await screen.findByText('x_kubernetes_get_pods'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Infrastructure' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Workflows' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Resolves to, for you (2)' }),
    ).toBeInTheDocument();
    expect(filterTools).toHaveBeenCalledWith(
      expect.objectContaining({
        installation: 'gazelle',
        toolset: ['preset:read-only', 'workflow:incident-triage'],
      }),
    );
    // Never the forbidden vocabulary.
    expect(card().textContent).not.toMatch(/restricted|enforced|permission/i);
  });

  it('marks selectors that match nothing for the viewer', async () => {
    const { api } = makeApi(resolvedAnswer(['tool:x_gone_away']));
    await renderCard(withToolset('preset:read-only,tool:x_gone_away'), api);

    expect(
      await screen.findByText('Some selectors match nothing for you'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('tool:x_gone_away (matches nothing for you)'),
    ).toBeInTheDocument();
  });

  it('offers the sign-in for a server the viewer has not authenticated with', async () => {
    const { api } = makeApi(resolvedAnswer(['server:pro']));
    await renderCard(withToolset('preset:read-only,server:pro'), api);

    expect(
      await screen.findByText("Sign in to see these servers' tools"),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it("shows muster's error when the toolset names a preset the installation does not define", async () => {
    const { api } = makeApi(() => {
      throw new Error(
        'toolset [preset:legacy] names unknown preset "legacy"; known presets: read-only, none, full',
      );
    });
    await renderCard(withToolset('preset:legacy'), api);

    expect(
      await screen.findByText(
        'The toolset names a preset this installation does not define',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/unknown preset "legacy"/)).toBeInTheDocument();
  });

  it('says so when this muster does not evaluate toolsets yet', async () => {
    const { api } = makeApi(() => ({
      total: 2,
      filtered_count: 2,
      truncated: false,
      tools: RESOLVED,
    }));
    await renderCard(withToolset('preset:read-only'), api);

    expect(
      await screen.findByText(
        "This installation's muster does not evaluate toolsets yet",
      ),
    ).toBeInTheDocument();
  });

  it('shows the declaration without a resolution where the muster plugin is not installed', async () => {
    await renderCard(withToolset('preset:read-only,server:pro'));

    expect(screen.getByText('preset:read-only')).toBeInTheDocument();
    expect(
      screen.getByText('Resolution not available in this portal'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
  });
});
