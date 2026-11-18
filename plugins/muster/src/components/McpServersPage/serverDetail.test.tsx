import { screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import {
  DateTimeZoneProvider,
  formatLocalDateFull,
} from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../apis';
import { mcpServersRouteRef } from '../../routes';
import { MCPServer, MCPServerState } from '../../lib/k8s';
import {
  AuthChain,
  hasHealthDetails,
  HealthDetails,
  ServerConfig,
  noToolsExplanation,
  ServerTools,
} from './serverDetail';

function makeServer(
  spec: Record<string, unknown>,
  state?: MCPServerState,
  /** CR labels; `app.kubernetes.io/managed-by: Helm` marks it GitOps-managed. */
  labels?: Record<string, string>,
  /** The muster `Ready` condition, when the test needs the explanation. */
  ready?: { status: 'True' | 'False'; reason: string; message: string },
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name: 'aws-root', ...(labels ? { labels } : {}) },
      spec,
      ...(state
        ? {
            status: {
              state,
              ...(ready ? { conditions: [{ type: 'Ready', ...ready }] } : {}),
            },
          }
        : {}),
    } as never,
    'gazelle',
  );
}

const EXCHANGE_SPEC = {
  type: 'streamable-http',
  url: 'https://mcp-kubernetes.remote.example.test/mcp',
  auth: {
    type: 'oauth',
    tokenExchange: {
      enabled: true,
      dexTokenEndpoint: 'https://dex.remote.example.test/token',
      connectorId: 'remote-oidc',
    },
  },
};

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
      screen.getByText(/Use “Turn on” in the connector’s menu/),
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
      screen.getByText(/disconnected until activated\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Use “Turn on”/)).not.toBeInTheDocument();
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
    expect(screen.getByText(/all users share it/)).toBeInTheDocument();
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
      screen.getByText(/signs as Muster's own identity/),
    ).toBeInTheDocument();
  });

  it.each([
    [
      'a forwarded token',
      { forwardToken: true, requiredAudiences: ['k'] },
      'oauth (implied by the forwarded token)',
      'Platform SSO (forwarded token)',
    ],
    [
      'token exchange',
      {
        forwardToken: true,
        tokenExchange: { enabled: true, connectorId: 'giantswarm' },
      },
      'oauth (implied by token exchange)',
      'Token exchange (cross-cluster SSO)',
    ],
    [
      'token exchange and no forwarded token',
      { tokenExchange: { enabled: true, connectorId: 'giantswarm' } },
      'oauth (implied by token exchange)',
      'Token exchange (cross-cluster SSO)',
    ],
  ])('shows the chain of a server with %s', async (_, auth, type, mode) => {
    // Without `type`, as the wizard writes it, and with the `type: none` and
    // `forwardToken: false` defaults the cluster returns it with.
    for (const stored of [
      auth,
      { type: 'none', forwardToken: false, ...auth },
    ]) {
      const { unmount } = await renderInTestApp(
        <AuthChain
          server={makeServer({ type: 'streamable-http', auth: stored })}
        />,
      );

      expect(screen.queryByText('No authentication')).not.toBeInTheDocument();
      expect(screen.getByText(mode)).toBeInTheDocument();
      expect(screen.getByText(type)).toBeInTheDocument();
      expect(screen.getByText('Forward token')).toBeInTheDocument();
      unmount();
    }
  });

  it('says a server without an auth block is anonymous', async () => {
    await renderInTestApp(
      <AuthChain server={makeServer({ type: 'streamable-http' })} />,
    );

    expect(screen.getByText('No authentication')).toBeInTheDocument();
  });

  it('shows the settings an anonymous server still carries', async () => {
    await renderInTestApp(
      <AuthChain
        server={makeServer({
          type: 'streamable-http',
          auth: { type: 'none', forwardToken: false, requiredAudiences: ['k'] },
        })}
      />,
    );

    expect(screen.getByText('No authentication')).toBeInTheDocument();
    expect(screen.getByText('Required audiences')).toBeInTheDocument();
    expect(screen.getByText('k')).toBeInTheDocument();
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
    expect(screen.queryByText(/all users share it/)).not.toBeInTheDocument();
  });
});

/** Renders the tool list over a stubbed `filter_tools` result. */
async function renderTools(
  server: MCPServer,
  result: Record<string, unknown> = { tools: [] },
) {
  const musterApi = { filterTools: jest.fn().mockResolvedValue(result) };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>
        <ServerTools server={server} />
      </QueryClientProvider>
    </TestApiProvider>,
    // ServerTools links each tool to its page, so the route the link resolves
    // against has to be mounted.
    { mountedRoutes: { '/customize/connectors': mcpServersRouteRef } },
  );
}

describe('ServerTools', () => {
  it('links each tool to its page beneath this server', async () => {
    // The tags are the way from a server to its tools; each opens the tool
    // under the server offering it, on the same installation.
    await renderTools(makeServer(OAUTH_SPEC, 'Connected'), {
      total: 1,
      tools: [{ name: 'x_aws-root_list_buckets', summary: 'List buckets' }],
    });

    const link = await screen.findByRole('link', { name: 'list_buckets' });
    expect(link).toHaveAttribute(
      'href',
      '/customize/connectors/gazelle/aws-root/tools/x_aws-root_list_buckets',
    );
    expect(
      screen.getByRole('link', { name: 'Open the server’s tools' }),
    ).toHaveAttribute('href', '/customize/connectors/gazelle/aws-root');
  });

  it('marks a tool pill’s link as a control, and the text link as text', async () => {
    // The agent shell underlines every bui link that is not `standalone`; a
    // link filling a pill is a control, not a text link.
    await renderTools(makeServer(OAUTH_SPEC, 'Connected'), {
      total: 1,
      tools: [{ name: 'x_aws-root_list_buckets', summary: 'List buckets' }],
    });

    expect(
      await screen.findByRole('link', { name: 'list_buckets' }),
    ).toHaveAttribute('data-standalone', 'true');
    expect(
      screen.getByRole('link', { name: 'Open the server’s tools' }),
    ).not.toHaveAttribute('data-standalone', 'true');
  });
});

describe('ServerTools with no tools to show', () => {
  it('says plainly that a connector muster is not connected to shows no tools', async () => {
    await renderTools(makeServer(SIGV4_SPEC, 'Disconnected'));
    expect(
      await screen.findByText(
        'This connector is disconnected, so its tools cannot be shown.',
      ),
    ).toBeInTheDocument();
  });

  it('names a failed or connecting connector’s state, not a guess', async () => {
    expect(noToolsExplanation(makeServer(SIGV4_SPEC, 'Failed'))).toEqual({
      text: 'This connector failed to connect, so its tools cannot be shown.',
      tone: 'warning',
    });
    expect(noToolsExplanation(makeServer(SIGV4_SPEC, 'Connecting'))).toEqual({
      text: 'This connector is still connecting, so its tools cannot be shown.',
      tone: 'neutral',
    });
    expect(noToolsExplanation(makeServer(SIGV4_SPEC, 'Connected'))).toEqual({
      text: 'No tools exposed (the connector may be down or unreachable).',
      tone: 'neutral',
    });
  });

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
      await screen.findByText(/the connector may be down or unreachable/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Use “Sign in” in its actions/),
    ).not.toBeInTheDocument();
  });

  it('still points an OAuth server’s user at the sign-in', async () => {
    await renderTools(makeServer(OAUTH_SPEC, 'Auth Required'));

    expect(
      await screen.findByText(/Use “Sign in” in its actions/),
    ).toBeInTheDocument();
  });

  it('says a per-session server connects with the person’s own identity, not a sign-in', async () => {
    // Awaiting Session: muster holds no connection of its own, the tools
    // appear once this session has connected the server. Neither "down" nor
    // "Sign in" is true here.
    await renderTools(makeServer(EXCHANGE_SPEC, 'Awaiting Session'));

    expect(
      await screen.findByText(
        /connects per session with your identity; its tools appear once Muster has connected it for you/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Use “Sign in”/)).not.toBeInTheDocument();
    expect(screen.queryByText(/down or unreachable/)).not.toBeInTheDocument();
  });

  it('explains a Failed token exchange with muster’s own sentence', async () => {
    // The Ready condition tells a broken exchange from an endpoint that does
    // not answer; the generic "may be down" would hide the Secret to fix.
    await renderTools(
      makeServer(EXCHANGE_SPEC, 'Failed', undefined, {
        status: 'False',
        reason: 'TokenExchangeCredentials',
        message:
          'token exchange credentials from Secret agent-platform/remote-token-exchange-credentials: secrets "remote-token-exchange-credentials" not found',
      }),
    );

    const explanation = await screen.findByText(
      /No tools exposed — token exchange credentials from Secret agent-platform\/remote-token-exchange-credentials/,
    );
    // A failure reads as a warning, as on the connector's Tools tab.
    expect(explanation.closest('[data-status]')).toHaveAttribute(
      'data-status',
      'warning',
    );
    expect(screen.queryByText(/down or unreachable/)).not.toBeInTheDocument();
  });

  it('says a deactivated server is deactivated, not down and not unauthenticated', async () => {
    // Deactivated wins over both other explanations: muster keeps the server
    // disconnected on purpose, so neither reachability nor a sign-in is the
    // remedy -- even while the CR still reads `Auth Required`.
    await renderTools(
      makeServer({ ...OAUTH_SPEC, suspended: true }, 'Auth Required'),
    );

    const explanation = await screen.findByText(
      'No tools exposed — this connector is deactivated. Use “Turn on” in the connector’s menu.',
    );
    expect(explanation.closest('[data-status]')).toBeNull();
    expect(screen.queryByText(/down or unreachable/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Use “Sign in”/)).not.toBeInTheDocument();
  });
});

describe('HealthDetails', () => {
  const MINUTE = 60 * 1000;

  function serverWithStatus(status: Record<string, unknown>): MCPServer {
    return new MCPServer(
      {
        apiVersion: 'muster.giantswarm.io/v1alpha1',
        kind: 'MCPServer',
        metadata: { name: 'aws-root' },
        spec: OAUTH_SPEC,
        status: { state: 'Failed', ...status },
      } as never,
      'gazelle',
    );
  }

  /** Renders the block on the shell's clock, as the app mounts it. */
  function renderHealth(server: MCPServer) {
    return renderInTestApp(
      <DateTimeZoneProvider timeZone="local">
        <HealthDetails server={server} />
      </DateTimeZoneProvider>,
    );
  }

  it('says when it last connected and when it retries, the local time on hover', async () => {
    const lastConnected = new Date(Date.now() - 5 * MINUTE).toISOString();
    const nextRetry = new Date(Date.now() + 3 * MINUTE).toISOString();

    await renderHealth(
      serverWithStatus({
        lastConnected,
        consecutiveFailures: 3,
        nextRetryAfter: nextRetry,
      }),
    );

    const last = screen.getByText('5 minutes ago');
    expect(last).toHaveAttribute('title', formatLocalDateFull(lastConnected));
    const retry = screen.getByText('in 3 minutes');
    expect(retry).toHaveAttribute('title', formatLocalDateFull(nextRetry));
    // No browser-locale timestamp in parentheses beside them.
    expect(screen.queryByText(/\(/)).not.toBeInTheDocument();
  });

  it('shows a timestamp that does not parse as muster wrote it', async () => {
    await renderHealth(serverWithStatus({ lastConnected: 'not a date' }));

    expect(screen.getByText('Last connected')).toBeInTheDocument();
    expect(screen.getByText('not a date')).toBeInTheDocument();
  });

  it('leaves out a retry time that has passed, and one once it passes', async () => {
    const passed = new Date(Date.now() - 2 * MINUTE).toISOString();
    expect(hasHealthDetails(serverWithStatus({ nextRetryAfter: passed }))).toBe(
      false,
    );
    expect(
      hasHealthDetails(serverWithStatus({ nextRetryAfter: 'not a date' })),
    ).toBe(false);

    const soon = new Date(Date.now() + 1500).toISOString();
    await renderHealth(
      serverWithStatus({ consecutiveFailures: 2, nextRetryAfter: soon }),
    );
    expect(screen.getByText('Next retry')).toBeInTheDocument();

    // Not "Next retry less than a minute ago".
    await waitFor(
      () => expect(screen.queryByText('Next retry')).not.toBeInTheDocument(),
      { timeout: 4000 },
    );
    expect(screen.getByText('Consecutive failures')).toBeInTheDocument();
  });
});
