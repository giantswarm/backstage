import { screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { musterApiRef } from '../../apis';
import { rootRouteRef } from '../../routes';
import { MCPServer, MCPServerState } from '../../lib/k8s';
import {
  AuthChain,
  RuntimeState,
  ServerConfig,
  ServerTools,
} from './serverDetail';

function makeServer(
  spec: Record<string, unknown>,
  state?: MCPServerState,
  /** CR labels; `app.kubernetes.io/managed-by: Helm` marks it GitOps-managed. */
  labels?: Record<string, string>,
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name: 'aws-root', ...(labels ? { labels } : {}) },
      spec,
      ...(state ? { status: { state } } : {}),
    } as never,
    'gazelle',
  );
}

const OAUTH_SPEC = { type: 'streamable-http', auth: { type: 'oauth' } };
const HELM_MANAGED = { 'app.kubernetes.io/managed-by': 'Helm' };

const SIGV4_SPEC = {
  type: 'streamable-http',
  url: 'https://aws-mcp.eu-central-1.api.aws/mcp',
  auth: { type: 'sigv4', sigv4: { region: 'eu-central-1' } },
  meta: { AWS_REGION: 'eu-central-1' },
};

describe('ServerConfig', () => {
  it('shows the request metadata a remote server sends on every call', async () => {
    // `spec.meta` decides which region an AWS-hosted server answers about, and
    // a wrong value produces a confident answer rather than an error — so it
    // belongs in the config view, not hidden behind the raw manifest.
    await renderInTestApp(<ServerConfig server={makeServer(SIGV4_SPEC)} />);

    expect(screen.getByText('Meta AWS_REGION')).toBeInTheDocument();
    expect(screen.getByText('eu-central-1')).toBeInTheDocument();
  });

  it('shows no metadata rows for a server without any', async () => {
    await renderInTestApp(
      <ServerConfig server={makeServer({ type: 'streamable-http' })} />,
    );

    expect(screen.queryByText(/^Meta /)).not.toBeInTheDocument();
  });

  it('names the deactivation and where to undo it', async () => {
    // `spec.suspended` is the reason behind a `Disconnected` live state; the
    // row puts it on the page instead of leaving the Activate button as the
    // only trace.
    await renderInTestApp(
      <ServerConfig
        server={makeServer({ ...OAUTH_SPEC, suspended: true }, 'Disconnected')}
      />,
    );

    expect(screen.getByText('Deactivated')).toBeInTheDocument();
    expect(
      screen.getByText(/Use “Activate” in the actions below/),
    ).toBeInTheDocument();
  });

  it('has no deactivation row for an active server', async () => {
    await renderInTestApp(
      <ServerConfig server={makeServer(OAUTH_SPEC, 'Connected')} />,
    );

    expect(screen.queryByText('Deactivated')).not.toBeInTheDocument();
  });

  it('does not point a GitOps-managed server at an Activate button it has not got', async () => {
    // The lifecycle buttons only render for ad-hoc servers; the managed row
    // offers manifests, so the hint must stop at the fact.
    await renderInTestApp(
      <ServerConfig
        server={makeServer(
          { ...OAUTH_SPEC, suspended: true },
          'Disconnected',
          HELM_MANAGED,
        )}
      />,
    );

    expect(screen.getByText('Deactivated')).toBeInTheDocument();
    expect(
      screen.getByText(/muster keeps it disconnected until it is activated\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Use “Activate”/)).not.toBeInTheDocument();
  });
});

describe('AuthChain', () => {
  it('names the machine identity and the signing configuration', async () => {
    await renderInTestApp(
      <AuthChain
        server={makeServer({
          ...SIGV4_SPEC,
          auth: {
            type: 'sigv4',
            sigv4: {
              region: 'eu-central-1',
              service: 'aws-mcp',
              roleArn: 'arn:aws:iam::123456789012:role/muster-mcp',
            },
          },
        })}
      />,
    );

    expect(screen.getByText('sigv4')).toBeInTheDocument();
    expect(
      screen.getByText(/All users share this identity/),
    ).toBeInTheDocument();
    expect(screen.getByText('Signing region')).toBeInTheDocument();
    expect(screen.getByText('eu-central-1')).toBeInTheDocument();
    expect(screen.getByText('aws-mcp')).toBeInTheDocument();
    expect(
      screen.getByText('arn:aws:iam::123456789012:role/muster-mcp'),
    ).toBeInTheDocument();
    // Forward token can only ever be "no" here — the CRD rejects the pair.
    expect(screen.queryByText('Forward token')).not.toBeInTheDocument();
  });

  it('says what muster does when the optional overrides are absent', async () => {
    await renderInTestApp(<AuthChain server={makeServer(SIGV4_SPEC)} />);

    expect(screen.getByText('derived from the URL host')).toBeInTheDocument();
    expect(
      screen.getByText(/signs as muster's own identity/),
    ).toBeInTheDocument();
  });

  it('leaves the OAuth chain untouched', async () => {
    await renderInTestApp(
      <AuthChain
        server={makeServer({
          type: 'streamable-http',
          auth: { type: 'oauth', forwardToken: true },
        })}
      />,
    );

    expect(screen.getByText('Forward token')).toBeInTheDocument();
    expect(screen.queryByText('Signing region')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/All users share this identity/),
    ).not.toBeInTheDocument();
  });
});

describe('ServerTools with no tools to show', () => {
  /** Renders the tool list for a server whose catalogue comes back empty. */
  async function renderTools(server: MCPServer) {
    const musterApi = {
      filterTools: jest.fn().mockResolvedValue({ tools: [] }),
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return renderInTestApp(
      <TestApiProvider apis={[[musterApiRef, musterApi]]}>
        <QueryClientProvider client={queryClient}>
          <ServerTools server={server} />
        </QueryClientProvider>
      </TestApiProvider>,
      // ServerTools links each tool into the explorer, so the route the link
      // resolves against has to be mounted.
      { mountedRoutes: { '/agent-platform/muster': rootRouteRef } },
    );
  }

  it('does not send a sigv4 server’s user to a sign-in that cannot exist', async () => {
    // muster keeps a rejected sigv4 credential in `Failed`, but the CR status
    // is one read behind the aggregator — so the guard is the auth type, not
    // the hope that `Auth Required` never appears here.
    await renderTools(
      makeServer(
        {
          ...SIGV4_SPEC,
          auth: { type: 'sigv4', sigv4: { region: 'eu-central-1' } },
        },
        'Auth Required',
      ),
    );

    expect(
      await screen.findByText(/the server may be down or unreachable/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Use “Sign in” in the actions below/),
    ).not.toBeInTheDocument();
  });

  it('still points an OAuth server’s user at the sign-in', async () => {
    await renderTools(makeServer(OAUTH_SPEC, 'Auth Required'));

    expect(
      await screen.findByText(/Use “Sign in” in the actions below/),
    ).toBeInTheDocument();
  });

  it('says a deactivated server is deactivated, not down and not unauthenticated', async () => {
    // Deactivated wins over both other explanations: muster keeps the server
    // disconnected on purpose, so neither reachability nor a sign-in is the
    // remedy -- even while the CR still reads `Auth Required`.
    await renderTools(
      makeServer({ ...OAUTH_SPEC, suspended: true }, 'Auth Required'),
    );

    expect(
      await screen.findByText(
        'No tools exposed — this server is deactivated. Use “Activate” in the actions below.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/down or unreachable/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Use “Sign in”/)).not.toBeInTheDocument();
  });
});

describe('RuntimeState on a deactivated server', () => {
  /** Renders the live runtime block over a stubbed `core_mcpserver_list`. */
  async function renderRuntime(server: MCPServer) {
    const musterApi = {
      listServers: jest.fn().mockResolvedValue({
        mcpServers: [
          {
            name: 'aws-root',
            state: 'Disconnected',
            sessionStatus: 'connected',
            toolsCount: 58,
          },
        ],
      }),
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return renderInTestApp(
      <TestApiProvider apis={[[musterApiRef, musterApi]]}>
        <QueryClientProvider client={queryClient}>
          <RuntimeState server={server} />
        </QueryClientProvider>
      </TestApiProvider>,
    );
  }

  it('marks the session rows so a stale connection is not read as a working server', async () => {
    // The aggregator answers the session's last connection ("connected",
    // 58 tools) next to a `Disconnected` live state; without the note the
    // block reads like a working server with an empty Tools block.
    await renderRuntime(
      makeServer({ ...OAUTH_SPEC, suspended: true }, 'Disconnected'),
    );

    expect(await screen.findByText('connected')).toBeInTheDocument();
    expect(screen.getByText('58')).toBeInTheDocument();
    expect(
      screen.getByText(/the session rows below are your session's last/),
    ).toBeInTheDocument();
  });

  it('leaves an active server’s session rows unremarked', async () => {
    await renderRuntime(makeServer(OAUTH_SPEC, 'Disconnected'));

    expect(await screen.findByText('connected')).toBeInTheDocument();
    expect(
      screen.queryByText(/the session rows below/),
    ).not.toBeInTheDocument();
  });
});
