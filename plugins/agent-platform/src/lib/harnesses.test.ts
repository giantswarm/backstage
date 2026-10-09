import { Harness } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  harnessChoicesOf,
  harnessLimitEntries,
  harnessTitle,
  imageNameOf,
  runtimeLabel,
} from './harnesses';

function harness(
  name: string,
  spec: Record<string, unknown>,
  { namespace = 'kagent' }: { namespace?: string } = {},
): Harness {
  return new Harness(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'Harness',
      metadata: { name, namespace },
      spec: {
        workload: {
          image: `gsoci.azurecr.io/giantswarm/kagent/${name}-harness@sha256:0123`,
        },
        substrate: {
          workerPoolRef: { name: 'kagent' },
          snapshotPolicy: { location: `s3://snapshots/${name}` },
        },
        ...spec,
      },
    } as never,
    'gazelle',
  );
}

describe('harnessChoicesOf', () => {
  const lab = [
    harness('go', { claude: {} }),
    harness('kagent', { kagent: {} }),
    harness('claude', { claude: {} }),
    harness('elsewhere', { claude: {} }, { namespace: 'demo' }),
  ];

  it('offers every Harness of the namespace, the platform one first', () => {
    expect(harnessChoicesOf(lab, 'kagent', 'kagent')).toEqual([
      { name: 'kagent', runtime: 'kagent', imageName: 'kagent-harness' },
      { name: 'claude', runtime: 'claude', imageName: 'claude-harness' },
      { name: 'go', runtime: 'claude', imageName: 'go-harness' },
    ]);
  });

  it('carries the display name an admin set', () => {
    const annotated = new Harness(
      {
        apiVersion: 'api.kagent.dev/v1alpha3',
        kind: 'Harness',
        metadata: {
          name: 'go',
          namespace: 'kagent',
          annotations: {
            'ui.giantswarm.io/display-name': 'Claude Code with Go',
          },
        },
        spec: { claude: {}, workload: { image: 'img@sha256:0' } },
      } as never,
      'gazelle',
    );
    expect(harnessChoicesOf([annotated], 'kagent', 'kagent')).toEqual([
      expect.objectContaining({
        name: 'go',
        displayName: 'Claude Code with Go',
      }),
    ]);
  });
});

describe('harnessChoicesOf limits', () => {
  it('carries the limits a Claude Code Harness sets', () => {
    const [choice] = harnessChoicesOf(
      [
        harness('claude', {
          claude: { limits: { budgetUSD: '5', maxTurns: 30 } },
        }),
      ],
      'kagent',
      'kagent',
    );

    expect(choice.limits).toEqual({ budgetUSD: '5', maxTurns: 30 });
  });
});

describe('harnessLimitEntries', () => {
  it('lists the set limits, the budget as configured', () => {
    expect(harnessLimitEntries({ budgetUSD: '0.50', maxTurns: 1200 })).toEqual([
      { label: 'Budget per turn', value: '$0.50' },
      { label: 'Max steps per turn', value: '1,200' },
    ]);
  });

  it('leaves out what is unset or unusable', () => {
    expect(harnessLimitEntries(undefined)).toEqual([]);
    expect(harnessLimitEntries({ budgetUSD: ' ', maxTurns: 0 })).toEqual([]);
    expect(harnessLimitEntries({ maxTurns: 3 })).toEqual([
      { label: 'Max steps per turn', value: '3' },
    ]);
  });

  it('shows a budget that is not a plain number as written', () => {
    expect(harnessLimitEntries({ budgetUSD: '5e' })).toEqual([
      { label: 'Budget per turn', value: '5e USD' },
    ]);
  });
});

describe('imageNameOf', () => {
  it('keeps the repository name only', () => {
    expect(
      imageNameOf(
        'localhost:5001/giantswarm/klaus-toolchains/harness-go@sha256:3030',
      ),
    ).toBe('harness-go');
    expect(imageNameOf('ghcr.io/org/runtime:1.2.3')).toBe('runtime');
    expect(imageNameOf(undefined)).toBeUndefined();
  });
});

describe('runtimeLabel', () => {
  it('names each runtime family', () => {
    expect(runtimeLabel('kagent')).toBe('Declarative (Go ADK)');
    expect(runtimeLabel('claude')).toBe('Claude Code');
    expect(runtimeLabel(undefined)).toBe('Unknown runtime');
  });
});

describe('harnessTitle', () => {
  it('prefers the display name, then the runtime family', () => {
    expect(
      harnessTitle({
        name: 'go',
        runtime: 'claude',
        displayName: 'Claude Code with Go',
      }),
    ).toBe('Claude Code with Go');
    expect(harnessTitle({ name: 'go', runtime: 'claude' })).toBe('Claude Code');
  });
});
