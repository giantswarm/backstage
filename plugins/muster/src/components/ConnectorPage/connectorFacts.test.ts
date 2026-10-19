import type { McpUsage } from '../../apis';
import { MCPServer } from '../../lib/k8s';
import {
  addedLine,
  callsLine,
  healthLine,
  runsAsCaller,
  signInLabel,
} from './connectorFacts';

function server(opts: {
  name?: string;
  auth?: Record<string, unknown>;
  state?: string;
  suspended?: boolean;
  created?: string;
}): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name: opts.name ?? 'jira',
        namespace: 'muster',
        creationTimestamp: opts.created,
      },
      spec: {
        type: 'streamable-http',
        url: 'https://jira.example.test/mcp',
        auth: opts.auth,
        suspended: opts.suspended,
      },
      status: { state: opts.state ?? 'Connected' },
    } as never,
    'gazelle',
  );
}

function usage(calls: number, errors: number, available = true): McpUsage {
  return {
    available,
    range_hours: 720,
    step_hours: 24,
    buckets: [],
    totals: {
      calls,
      errors,
      error_ratio: calls > 0 ? errors / calls : null,
      p95_seconds: null,
      distinct_tools: 0,
    },
    top_tools: [],
    servers: [],
  };
}

describe('connectorFacts', () => {
  it.each([
    [{ forwardToken: true, type: 'oauth' }, 'Company login', true],
    [{ type: 'oauth' }, 'Each person signs in with their own account', true],
    [undefined, 'No sign-in', false],
    [
      { type: 'sigv4', sigv4: { region: 'eu-west-1' } },
      'AWS request signing',
      false,
    ],
  ])('names the sign-in of %j', (auth, label, asCaller) => {
    expect(signInLabel(server({ auth }))).toBe(label);
    expect(runsAsCaller(server({ auth }))).toBe(asCaller);
  });

  it('counts the healthy instances, a turned-off one not among them', () => {
    expect(healthLine([server({})])).toBe('1 of 1 instance healthy');
    expect(
      healthLine([
        server({}),
        server({ state: 'Failed' }),
        server({ state: 'Disconnected', suspended: true }),
      ]),
    ).toBe('1 of 3 instances healthy');
  });

  it('counts the calls of the usage read for the connector, with its errors', () => {
    // Fractions, as Prometheus' `increase()` estimates counts.
    expect(callsLine(usage(3417.6, 14.2))).toBe('3,418 · 0.4% errors');
    expect(callsLine(usage(40, 8))).toBe('40 · 20% errors');
  });

  it('says plainly when there were no calls, and nothing without usage', () => {
    expect(callsLine(usage(0, 0))).toBe('0');
    expect(callsLine(usage(0, 0, false))).toBeUndefined();
  });

  it('dates the oldest instance', () => {
    expect(
      addedLine([
        server({ created: '2026-09-02T10:00:00Z' }),
        server({ created: '2026-08-04T10:00:00Z' }),
      ]),
    ).toBe('4 Aug 2026');
    expect(addedLine([server({})])).toBeUndefined();
  });
});
