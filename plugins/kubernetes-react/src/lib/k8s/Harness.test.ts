import { crds } from '@giantswarm/k8s-types';
import { Harness } from './Harness';

type HarnessInterface = crds.kagent.v1alpha3.Harness;

function makeHarness(spec: Record<string, unknown>): Harness {
  return new Harness(
    {
      apiVersion: 'kagent.dev/v1alpha3',
      kind: 'Harness',
      metadata: { name: 'claude', namespace: 'kagent' },
      spec: {
        workload: {
          image:
            'gsoci.azurecr.io/giantswarm/kagent/claude-harness@sha256:85230e58',
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

  it('reads the harness label value its selector admits templates by', () => {
    const selecting = (matchLabels: Record<string, string>) =>
      makeHarness({ allowedAgentTemplates: { selector: { matchLabels } } });

    expect(
      selecting({
        'agent-platform.giantswarm.io/harness': 'claude',
      }).getAdmittedHarnessLabel(),
    ).toBe('claude');
    expect(
      selecting({ team: 'bumblebee' }).getAdmittedHarnessLabel(),
    ).toBeUndefined();
    expect(
      selecting({
        'agent-platform.giantswarm.io/harness': ' ',
      }).getAdmittedHarnessLabel(),
    ).toBeUndefined();
    expect(makeHarness({}).getAdmittedHarnessLabel()).toBeUndefined();
  });

  it('reads the workload image', () => {
    expect(makeHarness({ claude: {} }).getImage()).toBe(
      'gsoci.azurecr.io/giantswarm/kagent/claude-harness@sha256:85230e58',
    );
  });
});
