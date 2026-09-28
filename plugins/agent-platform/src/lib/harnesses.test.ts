import { Harness } from '@giantswarm/backstage-plugin-kubernetes-react';
import { harnessChoicesOf, imageNameOf, runtimeLabel } from './harnesses';

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
