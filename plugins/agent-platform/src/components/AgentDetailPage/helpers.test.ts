import {
  Agent,
  AgentTemplateInterface,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  describeToolScope,
  isGatewayServerBinding,
  mcpBindingId,
  shortPin,
  skillLabel,
  toAgentManifestYaml,
} from './helpers';

type AgentInterface = AgentTemplateInterface;

function makeAgent(overrides: Partial<AgentInterface> = {}): Agent {
  return new Agent(
    {
      apiVersion: 'kagent.dev/v1alpha3',
      kind: 'AgentTemplate',
      metadata: { name: 'pr-reviewer', namespace: 'agent-platform' },
      ...overrides,
    } as AgentInterface,
    'gazelle',
  );
}

const binding = (name: string, tools?: string[]) => ({
  server: { kind: 'RemoteMCPServer', name },
  ...(tools ? { tools } : {}),
});

describe('isGatewayServerBinding', () => {
  const agent = makeAgent();

  // The Generic chart renders the gateway into a RemoteMCPServer named after the
  // agent — that is the carrier; a shared gateway server keeps its name.
  it('recognises the agent’s own carrier and the shared gateway', () => {
    expect(isGatewayServerBinding(agent, binding('pr-reviewer'))).toBe(true);
    expect(isGatewayServerBinding(agent, binding('muster'))).toBe(true);
  });

  it('does not claim any other server is the gateway', () => {
    expect(isGatewayServerBinding(agent, binding('grafana'))).toBe(false);
    expect(isGatewayServerBinding(agent, binding('muster-staging'))).toBe(
      false,
    );
  });
});

describe('mcpBindingId', () => {
  it('names the kind and the server', () => {
    expect(mcpBindingId(binding('grafana'))).toBe('RemoteMCPServer grafana');
  });
});

describe('describeToolScope', () => {
  // An absent allowlist means "everything", which is worth stating rather than
  // leaving to be inferred from a missing value.
  it('says all tools when no allowlist is set', () => {
    expect(describeToolScope(binding('grafana'), false)).toBe(
      'All tools from this server',
    );
    expect(describeToolScope(binding('grafana', []), false)).toBe(
      'All tools from this server',
    );
  });

  // Against the gateway an allowlist only ever names muster's meta-tools and
  // narrows nothing; the agent's tool access is its toolset, shown in its own
  // card — so the row says so instead of claiming "all tools".
  it('points the gateway entry at the toolset card', () => {
    expect(describeToolScope(binding('pr-reviewer'), true)).toMatch(
      /^The gateway; which of its tools .* see Toolset below$/,
    );
    expect(
      describeToolScope(binding('pr-reviewer', ['list_tools']), true),
    ).toMatch(/1 meta-tool \(list_tools\).*see Toolset below/);
  });

  it('lists an allowlist and counts it', () => {
    expect(
      describeToolScope(binding('grafana', ['query', 'dashboards']), false),
    ).toBe('2 tools: query, dashboards');
  });

  it('keeps the count singular for one tool', () => {
    expect(describeToolScope(binding('grafana', ['query']), false)).toBe(
      '1 tool: query',
    );
  });
});

describe('skillLabel', () => {
  it('prefers the explicit name', () => {
    expect(
      skillLabel({
        url: 'https://github.com/giantswarm/skills',
        path: 'pr/review',
        name: 'PR review conventions',
      }),
    ).toBe('PR review conventions');
  });

  it('falls back to the last path segment', () => {
    expect(
      skillLabel({
        url: 'https://github.com/giantswarm/skills',
        path: 'skills/idiomatic-go/',
      }),
    ).toBe('idiomatic-go');
  });

  it('falls back to the repository name, without the .git suffix', () => {
    expect(
      skillLabel({ url: 'https://github.com/giantswarm/skills.git' }),
    ).toBe('skills');
  });

  // A row with no label is unusable, so there is always something.
  it('falls back to the raw url when nothing else is available', () => {
    expect(skillLabel({ url: 'weird' })).toBe('weird');
  });
});

describe('shortPin', () => {
  it('shortens a git commit the way git log --oneline does', () => {
    expect(shortPin('0123456789abcdef0123456789abcdef01234567')).toBe(
      '0123456789ab',
    );
  });

  it('keeps the algorithm prefix of a digest', () => {
    expect(shortPin(`sha256:${'f'.repeat(64)}`)).toBe(
      `sha256:${'f'.repeat(12)}`,
    );
  });

  it('leaves anything else alone', () => {
    expect(shortPin('v-42')).toBe('v-42');
  });
});

describe('toAgentManifestYaml', () => {
  it('renders the resource as YAML, status included', () => {
    const yaml = toAgentManifestYaml(
      makeAgent({
        spec: { modelConfig: { name: 'opus' } },
        status: {
          observedGeneration: 1,
          harnesses: [
            {
              harness: 'kagent',
              desiredRevision: 'rev-1',
              latestSuccessfulRevision: 'rev-1',
              conditions: [
                {
                  type: 'Ready',
                  status: 'True',
                  reason: 'RevisionReady',
                  message: 'Revision rev-1 is ready',
                  lastTransitionTime: '2026-07-31T10:00:00Z',
                },
              ],
            },
          ],
        },
      } as Partial<AgentInterface>),
    );

    expect(yaml).toContain('kind: AgentTemplate');
    expect(yaml).toContain('apiVersion: kagent.dev/v1alpha3');
    expect(yaml).toContain('name: pr-reviewer');
    expect(yaml).toContain('name: opus');
    // The point of this view is to see what the page does not surface.
    expect(yaml).toContain('observedGeneration: 1');
    expect(yaml).toContain('harness: kagent');
  });

  // The view exists to be compared against `kubectl get -o yaml`, so it prints the
  // same key order.
  it('orders keys apiVersion, kind, metadata, spec, status', () => {
    const yaml = toAgentManifestYaml(
      makeAgent({
        spec: { modelConfig: { name: 'opus' } },
        status: { observedGeneration: 1, harnesses: [] },
      } as Partial<AgentInterface>),
    );

    const topLevelKeys = yaml
      .split('\n')
      .filter(line => /^\S/.test(line))
      .map(line => line.split(':')[0]);

    expect(topLevelKeys).toEqual([
      'apiVersion',
      'kind',
      'metadata',
      'spec',
      'status',
    ]);
  });

  // Server-side-apply bookkeeping is the bulk of a reconciled template and
  // pushes the spec off the screen; kubectl hides it too.
  it('drops managedFields', () => {
    const yaml = toAgentManifestYaml(
      makeAgent({
        metadata: {
          name: 'pr-reviewer',
          namespace: 'agent-platform',
          managedFields: [
            {
              manager: 'helm-controller',
              operation: 'Apply',
              apiVersion: 'kagent.dev/v1alpha3',
            },
          ],
        },
      } as Partial<AgentInterface>),
    );

    expect(yaml).not.toContain('managedFields');
    expect(yaml).not.toContain('helm-controller');
    expect(yaml).toContain('name: pr-reviewer');
  });

  it('drops the last-applied-configuration annotation but keeps the others', () => {
    const yaml = toAgentManifestYaml(
      makeAgent({
        metadata: {
          name: 'pr-reviewer',
          namespace: 'agent-platform',
          annotations: {
            'kubectl.kubernetes.io/last-applied-configuration':
              '{"apiVersion":"kagent.dev/v1alpha3","kind":"AgentTemplate"}',
            'ui.giantswarm.io/display-name': 'PR reviewer',
          },
        },
      } as Partial<AgentInterface>),
    );

    expect(yaml).not.toContain('last-applied-configuration');
    expect(yaml).toContain('ui.giantswarm.io/display-name: PR reviewer');
  });

  it('omits the annotations key entirely when only the dropped one was set', () => {
    const yaml = toAgentManifestYaml(
      makeAgent({
        metadata: {
          name: 'pr-reviewer',
          namespace: 'agent-platform',
          annotations: {
            'kubectl.kubernetes.io/last-applied-configuration': '{}',
          },
        },
      } as Partial<AgentInterface>),
    );

    expect(yaml).not.toContain('annotations');
  });

  // Long prompts and controller messages are the reason to open this view.
  it('does not fold long strings', () => {
    const longPrompt = 'word '.repeat(60).trim();
    const yaml = toAgentManifestYaml(
      makeAgent({
        spec: { systemPrompt: longPrompt },
      } as Partial<AgentInterface>),
    );

    expect(yaml).toContain(longPrompt);
  });
});
