import { Harness, type HarnessInterface } from './Harness';

function makeHarness(spec: Record<string, unknown>): Harness {
  return new Harness(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'Harness',
      metadata: { name: 'claude', namespace: 'kagent' },
      spec: {
        workload: {
          image:
            'gsoci.azurecr.io/giantswarm/kagent/claude-harness@sha256:85230e58',
        },
        substrate: {
          workerPoolRef: { name: 'kagent' },
          snapshotPolicy: { location: 's3://snapshots/claude' },
        },
        ...spec,
      },
    } as HarnessInterface,
    'gazelle',
  );
}

describe('Harness', () => {
  it('reads the runtime from the spec field that is set', () => {
    expect(makeHarness({ claude: {} }).getRuntime()).toBe('claude');
    expect(makeHarness({ kagent: { compaction: {} } }).getRuntime()).toBe(
      'kagent',
    );
    expect(makeHarness({ codex: {} }).getRuntime()).toBe('codex');
    expect(makeHarness({ byo: {} }).getRuntime()).toBe('byo');
    expect(makeHarness({}).getRuntime()).toBeUndefined();
  });

  it('is the api.kagent.dev Harness', () => {
    expect(Harness.group).toBe('api.kagent.dev');
    expect(Harness.plural).toBe('harnesses');
  });

  it('reads the Claude limits and the declared egress', () => {
    expect(
      makeHarness({
        claude: { limits: { budgetUSD: '2.50', maxTurns: 40 } },
        substrate: {
          workerPoolRef: { name: 'kagent' },
          snapshotPolicy: { location: 's3://snapshots/claude' },
          egress: ['github.com', '*.githubusercontent.com'],
        },
      }).getLimits(),
    ).toEqual({ budgetUSD: '2.50', maxTurns: 40 });
    expect(
      makeHarness({
        substrate: {
          workerPoolRef: { name: 'kagent' },
          snapshotPolicy: { location: 's3://snapshots/claude' },
          egress: ['github.com', '*.githubusercontent.com'],
        },
      }).getEgress(),
    ).toEqual(['github.com', '*.githubusercontent.com']);
    expect(makeHarness({ claude: {} }).getLimits()).toBeUndefined();
    expect(makeHarness({}).getEgress()).toEqual([]);
  });

  it('reads the display name annotation, ignoring a blank one', () => {
    const annotated = (value: string) =>
      new Harness(
        {
          apiVersion: 'api.kagent.dev/v1alpha3',
          kind: 'Harness',
          metadata: {
            name: 'go',
            namespace: 'kagent',
            annotations: { 'ui.giantswarm.io/display-name': value },
          },
        } as HarnessInterface,
        'gazelle',
      );

    expect(annotated('Claude Code with Go').getDisplayNameAnnotation()).toBe(
      'Claude Code with Go',
    );
    expect(annotated('  ').getDisplayNameAnnotation()).toBeUndefined();
    expect(makeHarness({}).getDisplayNameAnnotation()).toBeUndefined();
  });

  it('reads the workload image', () => {
    expect(makeHarness({ claude: {} }).getImage()).toBe(
      'gsoci.azurecr.io/giantswarm/kagent/claude-harness@sha256:85230e58',
    );
  });
});
