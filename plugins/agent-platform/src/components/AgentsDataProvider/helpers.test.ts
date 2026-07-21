import { crds } from '@giantswarm/k8s-types';
import {
  Agent,
  ModelConfig,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { resolveModelLabel, sortAgentRows, toAgentRow } from './helpers';

type AgentInterface = crds.kagent.v1alpha2.Agent;
type ModelConfigInterface = crds.kagent.v1alpha2.ModelConfig;

function makeAgent(
  partial: {
    name?: string;
    namespace?: string;
    displayName?: string;
    description?: string;
    modelConfig?: string;
    skills?: number;
    type?: 'Declarative' | 'BYO';
  },
  cluster = 'installation-1',
): Agent {
  const {
    name = 'agent-1',
    namespace = 'team-a',
    displayName,
    description,
    modelConfig,
    skills = 0,
    type = 'Declarative',
  } = partial;

  const json = {
    apiVersion: 'kagent.dev/v1alpha2',
    kind: 'Agent',
    metadata: {
      name,
      namespace,
      annotations: displayName
        ? { 'ui.giantswarm.io/display-name': displayName }
        : undefined,
    },
    spec: {
      type,
      description,
      declarative: modelConfig ? { modelConfig } : undefined,
      skills:
        skills > 0
          ? {
              gitRefs: Array.from({ length: skills }, (_, i) => ({
                url: 'https://github.com/giantswarm/skills',
                name: `skill-${i}`,
              })),
            }
          : undefined,
    },
  } as AgentInterface;

  return new Agent(json, cluster);
}

function makeModelConfig(
  partial: {
    name: string;
    namespace?: string;
    displayName?: string;
    model?: string;
  },
  cluster = 'installation-1',
): ModelConfig {
  const {
    name,
    namespace = 'team-a',
    displayName,
    model = 'claude-sonnet-4-6',
  } = partial;

  const json = {
    apiVersion: 'kagent.dev/v1alpha2',
    kind: 'ModelConfig',
    metadata: {
      name,
      namespace,
      annotations: displayName
        ? { 'ui.giantswarm.io/display-name': displayName }
        : undefined,
    },
    spec: { model, provider: 'Anthropic' },
  } as ModelConfigInterface;

  return new ModelConfig(json, cluster);
}

describe('resolveModelLabel', () => {
  it('resolves to the ModelConfig display name when found', () => {
    const agent = makeAgent({ modelConfig: 'sonnet-4-6', namespace: 'team-a' });
    const modelConfigs = [
      makeModelConfig({
        name: 'sonnet-4-6',
        namespace: 'team-a',
        displayName: 'Claude Sonnet 4.6',
      }),
    ];

    expect(resolveModelLabel(agent, modelConfigs)).toBe('Claude Sonnet 4.6');
  });

  it('falls back to the ModelConfig resource name when it has no display-name annotation', () => {
    const agent = makeAgent({ modelConfig: 'sonnet-4-6' });
    const modelConfigs = [makeModelConfig({ name: 'sonnet-4-6' })];

    expect(resolveModelLabel(agent, modelConfigs)).toBe('sonnet-4-6');
  });

  it('falls back to the raw reference when no ModelConfig matches', () => {
    const agent = makeAgent({ modelConfig: 'default-model-config' });

    expect(resolveModelLabel(agent, [])).toBe('default-model-config');
  });

  it('only matches ModelConfigs in the same namespace', () => {
    const agent = makeAgent({ modelConfig: 'sonnet-4-6', namespace: 'team-a' });
    const modelConfigs = [
      makeModelConfig({
        name: 'sonnet-4-6',
        namespace: 'team-b',
        displayName: 'Wrong namespace',
      }),
    ];

    // No same-namespace match -> raw ref.
    expect(resolveModelLabel(agent, modelConfigs)).toBe('sonnet-4-6');
  });

  it('returns undefined when the agent references no model (BYO)', () => {
    const agent = makeAgent({ type: 'BYO', modelConfig: undefined });

    expect(resolveModelLabel(agent, [])).toBeUndefined();
  });
});

describe('toAgentRow', () => {
  it('maps an agent to a plain row', () => {
    const agent = makeAgent({
      name: 'triager',
      namespace: 'sre-team',
      displayName: 'Incident triager',
      description: 'Triages incidents',
      modelConfig: 'sonnet-4-6',
      skills: 3,
    });
    const modelConfigs = [
      makeModelConfig({
        name: 'sonnet-4-6',
        namespace: 'sre-team',
        displayName: 'Claude Sonnet 4.6',
      }),
    ];

    expect(toAgentRow(agent, modelConfigs)).toEqual({
      id: 'installation-1/sre-team/triager',
      installation: 'installation-1',
      namespace: 'sre-team',
      name: 'Incident triager',
      technicalName: 'triager',
      description: 'Triages incidents',
      model: 'Claude Sonnet 4.6',
      skillCount: 3,
    });
  });

  it('uses the resource name and empty description as fallbacks', () => {
    const agent = makeAgent({ name: 'agent-x', displayName: undefined });

    const row = toAgentRow(agent, []);
    expect(row.name).toBe('agent-x');
    expect(row.description).toBe('');
    expect(row.model).toBeUndefined();
    expect(row.skillCount).toBe(0);
  });
});

describe('sortAgentRows', () => {
  it('orders by installation then display name', () => {
    const rows = [
      toAgentRow(makeAgent({ name: 'b', displayName: 'Beta' }, 'inst-b'), []),
      toAgentRow(makeAgent({ name: 'z', displayName: 'Zeta' }, 'inst-a'), []),
      toAgentRow(makeAgent({ name: 'a', displayName: 'Alpha' }, 'inst-a'), []),
    ];

    expect(sortAgentRows(rows).map(r => `${r.installation}:${r.name}`)).toEqual(
      ['inst-a:Alpha', 'inst-a:Zeta', 'inst-b:Beta'],
    );
  });
});
