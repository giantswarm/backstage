import { screen, waitFor } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  DateTimeZoneProvider,
  formatLocalDateFull,
} from '@giantswarm/backstage-plugin-ui-react';
import { MCPServer, MCPServerState } from '../../lib/k8s';
import {
  AuthChain,
  hasHealthDetails,
  HealthDetails,
  ServerConfig,
  noToolsExplanation,
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

const OAUTH_SPEC = { type: 'streamable-http', auth: { type: 'oauth' } };
const HELM_MANAGED = { 'app.kubernetes.io/managed-by': 'Helm' };

const SIGV4_SPEC = {
  type: 'streamable-http',
  url: 'https://aws-mcp.eu-central-1.api.aws/mcp',
  auth: { type: 'sigv4', sigv4: { region: 'eu-central-1' } },
  requestMeta: { AWS_REGION: 'eu-central-1' },
};

describe('ServerConfig', () => {
  it('shows the request metadata a remote server sends on every call', async () => {
    // `spec.requestMeta` decides which region an AWS-hosted server answers
    // about, and a wrong value produces a confident answer rather than an error
    // — so it belongs in the config view, not hidden behind the raw manifest.
    await renderInTestApp(<ServerConfig server={makeServer(SIGV4_SPEC)} />);

    expect(screen.getByText('Request meta AWS_REGION')).toBeInTheDocument();
    expect(screen.getByText('eu-central-1')).toBeInTheDocument();
  });

  it('shows no metadata rows for a server without any', async () => {
    await renderInTestApp(
      <ServerConfig server={makeServer({ type: 'streamable-http' })} />,
    );

    expect(screen.queryByText(/^Request meta /)).not.toBeInTheDocument();
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

describe('noToolsExplanation', () => {
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
