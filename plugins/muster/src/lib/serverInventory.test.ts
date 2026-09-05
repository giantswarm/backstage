import { MCPServer, MusterWorkflow } from './k8s';
import {
  authPosture,
  serverAuthMode,
  serverProvenance,
  workflowSummary,
} from './serverInventory';

function makeServer(
  spec: Record<string, unknown>,
  options: { name?: string; managed?: boolean } = {},
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name: options.name ?? 'srv',
        labels: options.managed
          ? { 'app.kubernetes.io/managed-by': 'Helm' }
          : {},
      },
      spec: { type: 'streamable-http', ...spec },
    } as never,
    'gazelle',
  );
}

function makeWorkflow(options: {
  name: string;
  valid?: boolean;
  managed?: boolean;
}): MusterWorkflow {
  return new MusterWorkflow(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'Workflow',
      metadata: {
        name: options.name,
        labels: options.managed
          ? { 'app.kubernetes.io/managed-by': 'Helm' }
          : {},
      },
      spec: { steps: [] },
      ...(options.valid === undefined
        ? {}
        : { status: { valid: options.valid } }),
    } as never,
    'gazelle',
  );
}

describe('serverAuthMode', () => {
  it.each([
    ['anonymous', {}],
    ['anonymous', { auth: { type: 'none' } }],
    ['own-account', { auth: { type: 'oauth' } }],
    [
      'platform-sso',
      { auth: { type: 'oauth', forwardToken: true, requiredAudiences: ['k'] } },
    ],
    [
      'token-exchange',
      {
        auth: {
          forwardToken: true,
          tokenExchange: { enabled: true, connectorId: 'giantswarm' },
        },
      },
    ],
    ['sigv4', { auth: { type: 'sigv4', sigv4: { region: 'eu-central-1' } } }],
  ])('classifies %s', (mode, spec) => {
    expect(serverAuthMode(makeServer(spec))).toBe(mode);
  });
});

describe('authPosture', () => {
  it('counts servers per mode in display order and drops unused modes', () => {
    const posture = authPosture([
      makeServer({ auth: { type: 'oauth' } }, { name: 'miro' }),
      makeServer(
        { auth: { type: 'oauth', forwardToken: true } },
        { name: 'a' },
      ),
      makeServer(
        { auth: { type: 'oauth', forwardToken: true } },
        { name: 'b' },
      ),
      makeServer({}, { name: 'echo' }),
    ]);

    expect(posture).toEqual([
      {
        mode: 'platform-sso',
        label: 'Platform SSO (forwarded token)',
        count: 2,
      },
      { mode: 'own-account', label: 'Own account (OAuth sign-in)', count: 1 },
      { mode: 'anonymous', label: 'Anonymous', count: 1 },
    ]);
  });
});

describe('serverProvenance', () => {
  it('splits GitOps-managed from live-registered servers and counts deactivated ones', () => {
    expect(
      serverProvenance([
        makeServer({}, { name: 'k8s', managed: true }),
        makeServer({ suspended: true }, { name: 'prom', managed: true }),
        makeServer({}, { name: 'miro' }),
      ]),
    ).toEqual({ total: 3, gitops: 2, adHoc: 1, suspended: 1 });
  });
});

describe('workflowSummary', () => {
  it('counts provenance and validation warnings', () => {
    expect(
      workflowSummary([
        makeWorkflow({ name: 'a', valid: true, managed: true }),
        makeWorkflow({ name: 'b', valid: false, managed: true }),
        // Not yet validated by muster: flagged like the table's badge does.
        makeWorkflow({ name: 'c' }),
      ]),
    ).toEqual({ total: 3, gitops: 2, adHoc: 1, validationWarnings: 2 });
  });
});
