import { crds } from '@giantswarm/k8s-types';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  describeToolScope,
  isMusterServerRef,
  mcpServerRefId,
  skillLabel,
  toAgentManifestYaml,
} from './helpers';

type AgentInterface = crds.kagent.v1alpha2.Agent;

function makeAgent(overrides: Partial<AgentInterface> = {}): Agent {
  return new Agent(
    {
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'Agent',
      metadata: { name: 'pr-reviewer', namespace: 'agent-platform' },
      ...overrides,
    } as AgentInterface,
    'gazelle',
  );
}

describe('isMusterServerRef', () => {
  // Matched on the name alone: the namespace is a chart value, so an installation
  // may place the gateway somewhere other than agent-platform.
  it('recognises the muster gateway in any namespace', () => {
    expect(isMusterServerRef({ name: 'muster' })).toBe(true);
    expect(isMusterServerRef({ name: 'muster', namespace: 'mcp' })).toBe(true);
  });

  it('does not claim any other server is muster', () => {
    expect(isMusterServerRef({ name: 'grafana' })).toBe(false);
    expect(isMusterServerRef({ name: 'muster-staging' })).toBe(false);
  });
});

describe('mcpServerRefId', () => {
  it('qualifies the name with the namespace when there is one', () => {
    expect(
      mcpServerRefId({ name: 'muster', namespace: 'agent-platform' }),
    ).toBe('agent-platform/muster');
  });

  it('falls back to the bare name', () => {
    expect(mcpServerRefId({ name: 'muster' })).toBe('muster');
  });
});

describe('describeToolScope', () => {
  // An absent allowlist means "everything", which is worth stating rather than
  // leaving to be inferred from a missing value.
  it('says all tools when no allowlist is set', () => {
    expect(describeToolScope({ name: 'muster' })).toBe(
      'All tools from this server',
    );
    expect(describeToolScope({ name: 'muster', toolNames: [] })).toBe(
      'All tools from this server',
    );
  });

  it('lists an allowlist and counts it', () => {
    expect(
      describeToolScope({
        name: 'grafana',
        toolNames: ['query', 'dashboards'],
      }),
    ).toBe('2 tools: query, dashboards');
  });

  it('keeps the count singular for one tool', () => {
    expect(describeToolScope({ name: 'grafana', toolNames: ['query'] })).toBe(
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

describe('toAgentManifestYaml', () => {
  it('renders the resource as YAML, status included', () => {
    const yaml = toAgentManifestYaml(
      makeAgent({
        spec: { type: 'Declarative', declarative: { modelConfig: 'opus' } },
        status: {
          observedGeneration: 1,
          conditions: [
            {
              type: 'Ready',
              status: 'True',
              reason: 'DeploymentReady',
              message: 'Deployment is ready',
              lastTransitionTime: '2026-07-31T10:00:00Z',
            },
          ],
        },
      } as Partial<AgentInterface>),
    );

    expect(yaml).toContain('kind: Agent');
    expect(yaml).toContain('apiVersion: kagent.dev/v1alpha2');
    expect(yaml).toContain('name: pr-reviewer');
    expect(yaml).toContain('modelConfig: opus');
    // The point of this view is to see what the page does not surface.
    expect(yaml).toContain('observedGeneration: 1');
  });

  // The view exists to be compared against `kubectl get -o yaml`, so it prints the
  // same key order.
  it('orders keys apiVersion, kind, metadata, spec, status', () => {
    const yaml = toAgentManifestYaml(
      makeAgent({
        spec: { type: 'Declarative' },
        status: { observedGeneration: 1, conditions: [] },
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

  // Server-side-apply bookkeeping is the bulk of a reconciled Agent and pushes
  // the spec off the screen; kubectl hides it too.
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
              apiVersion: 'kagent.dev/v1alpha2',
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
            'kubectl.kubernetes.io/last-applied-configuration': '{"a":1}',
            'ui.giantswarm.io/display-name': 'PR reviewer',
          },
        },
      } as Partial<AgentInterface>),
    );

    expect(yaml).not.toContain('last-applied-configuration');
    expect(yaml).toContain('ui.giantswarm.io/display-name');
  });

  it('omits the annotations key entirely when nothing is left', () => {
    const yaml = toAgentManifestYaml(
      makeAgent({
        metadata: {
          name: 'pr-reviewer',
          namespace: 'agent-platform',
          annotations: {
            'kubectl.kubernetes.io/last-applied-configuration': '{"a":1}',
          },
        },
      } as Partial<AgentInterface>),
    );

    expect(yaml).not.toContain('annotations');
  });

  // A long system message is a common reason to open this view, so it must not be
  // folded across lines.
  it('does not wrap long values', () => {
    const systemMessage = 'You review pull requests. '.repeat(20).trim();
    const yaml = toAgentManifestYaml(
      makeAgent({
        spec: { declarative: { systemMessage } },
      } as Partial<AgentInterface>),
    );

    expect(yaml).toContain(systemMessage);
  });
});
