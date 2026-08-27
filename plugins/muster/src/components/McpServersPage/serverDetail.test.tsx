import { screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { musterApiRef } from '../../apis';
import { rootRouteRef } from '../../routes';
import { MCPServer, MCPServerState } from '../../lib/k8s';
import { AuthChain, ServerConfig, ServerTools } from './serverDetail';

function makeServer(
  spec: Record<string, unknown>,
  state?: MCPServerState,
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name: 'aws-root' },
      spec,
      ...(state ? { status: { state } } : {}),
    } as never,
    'gazelle',
  );
}

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
    expect(screen.queryByText(/Sign in under/)).not.toBeInTheDocument();
  });

  it('still points an OAuth server’s user at the sign-in', async () => {
    await renderTools(
      makeServer(
        { type: 'streamable-http', auth: { type: 'oauth' } },
        'Auth Required',
      ),
    );

    expect(await screen.findByText(/Sign in under/)).toBeInTheDocument();
  });
});
