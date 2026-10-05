import { Harness } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  harnessChoicesOf,
  harnessTitle,
  imageNameOf,
  runtimeLabel,
  selectorAdmitsAgent,
} from './harnesses';

function harness(
  name: string,
  spec: Record<string, unknown>,
  {
    namespace = 'kagent',
    admits,
  }: { namespace?: string; admits?: string | null } = {},
): Harness {
  const label = admits === undefined ? name : admits;
  return new Harness(
    {
      apiVersion: 'kagent.dev/v1alpha3',
      kind: 'Harness',
      metadata: { name, namespace },
      spec: {
        ...(label && {
          allowedAgentTemplates: {
            selector: {
              matchLabels: { 'agent-platform.giantswarm.io/harness': label },
            },
          },
        }),
        workload: {
          image: `gsoci.azurecr.io/giantswarm/kagent/${name}-harness@sha256:0123`,
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
    harness('unlabelled', { claude: {} }, { admits: null }),
  ];

  it("offers the namespace's admitting Harnesses, the platform one first", () => {
    expect(harnessChoicesOf(lab, 'kagent', 'kagent')).toEqual([
      {
        name: 'kagent',
        admits: 'kagent',
        runtime: 'kagent',
        imageName: 'kagent-harness',
      },
      {
        name: 'claude',
        admits: 'claude',
        runtime: 'claude',
        imageName: 'claude-harness',
      },
      { name: 'go', admits: 'go', runtime: 'claude', imageName: 'go-harness' },
    ]);
  });

  it('carries the label value a Harness admits, which need not be its name', () => {
    expect(
      harnessChoicesOf(
        [harness('claude-go', { claude: {} }, { admits: 'go' })],
        'kagent',
        'kagent',
      ),
    ).toEqual([expect.objectContaining({ name: 'claude-go', admits: 'go' })]);
  });
});

describe('selector requirements', () => {
  const selecting = (
    name: string,
    selector: Record<string, unknown>,
  ): Harness =>
    harness(name, { kagent: {}, allowedAgentTemplates: { selector } });

  it('still offers the platform Harness whose values blank kagent.dev/harness', () => {
    expect(
      harnessChoicesOf(
        [
          selecting('kagent', {
            matchLabels: {
              'agent-platform.giantswarm.io/harness': 'kagent',
              'kagent.dev/harness': '',
            },
          }),
        ],
        'kagent',
        'kagent',
      ),
    ).toEqual([expect.objectContaining({ name: 'kagent' })]);
  });

  it('hides a Harness that needs a label the agent never carries', () => {
    expect(
      harnessChoicesOf(
        [
          selecting('kagent', {
            matchLabels: {
              'agent-platform.giantswarm.io/harness': 'kagent',
              'kagent.dev/harness': 'kagent',
            },
          }),
        ],
        'kagent',
        'kagent',
      ),
    ).toEqual([]);
  });

  it('accepts labels the chart stamps on every template', () => {
    expect(
      selectorAdmitsAgent(
        {
          matchLabels: {
            'agent-platform.giantswarm.io/harness': 'claude',
            'app.kubernetes.io/managed-by': 'Helm',
          },
        },
        'claude',
      ),
    ).toBe(true);
  });

  it('evaluates matchExpressions against the labels the template carries', () => {
    const admits = (matchExpressions: unknown[]) =>
      selectorAdmitsAgent(
        {
          matchLabels: { 'agent-platform.giantswarm.io/harness': 'claude' },
          matchExpressions,
        } as never,
        'claude',
      );

    expect(
      admits([
        {
          key: 'agent-platform.giantswarm.io/harness',
          operator: 'In',
          values: ['claude', 'codex'],
        },
        { key: 'helm.sh/chart', operator: 'Exists' },
        { key: 'team', operator: 'DoesNotExist' },
        { key: 'app', operator: 'NotIn', values: ['other'] },
      ]),
    ).toBe(true);
    expect(admits([{ key: 'team', operator: 'Exists' }])).toBe(false);
    expect(
      admits([{ key: 'app', operator: 'In', values: ['something-else'] }]),
    ).toBe(false);
    // No value of a per-release label holds for every agent.
    expect(
      admits([
        { key: 'app.kubernetes.io/instance', operator: 'In', values: ['a'] },
      ]),
    ).toBe(false);
    expect(admits([{ key: 'app', operator: 'Gt', values: ['1'] }])).toBe(false);
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
        admits: 'go',
        runtime: 'claude',
        displayName: 'Claude Code with Go',
      }),
    ).toBe('Claude Code with Go');
    expect(harnessTitle({ name: 'go', admits: 'go', runtime: 'claude' })).toBe(
      'Claude Code',
    );
  });
});
