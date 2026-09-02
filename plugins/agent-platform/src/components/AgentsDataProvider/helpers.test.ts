import { crds } from '@giantswarm/k8s-types';
import {
  Agent,
  ModelConfig,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import type { ServedModel } from '../../lib/serving';
import type { AgentRow } from './helpers';
import {
  getAgentsRefetchInterval,
  resolveModelConfig,
  resolveModelLabel,
  sortAgentRows,
  sortAgentsBy,
  toAgentRow,
} from './helpers';

type AgentInterface = crds.kagent.v1alpha2.Agent;
type ModelConfigInterface = crds.kagent.v1alpha2.ModelConfig;
type AgentCondition = NonNullable<
  NonNullable<AgentInterface['status']>['conditions']
>[number];

function makeAgent(
  partial: {
    name?: string;
    namespace?: string;
    displayName?: string;
    description?: string;
    modelConfig?: string;
    skills?: number;
    type?: 'Declarative' | 'BYO';
    conditions?: AgentCondition[];
    generation?: number;
    observedGeneration?: number;
    creationTimestamp?: string;
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
    conditions,
    generation = 1,
    observedGeneration = 1,
    creationTimestamp,
  } = partial;

  const json = {
    apiVersion: 'kagent.dev/v1alpha2',
    kind: 'Agent',
    metadata: {
      name,
      namespace,
      generation,
      creationTimestamp,
      annotations: displayName
        ? { 'ui.giantswarm.io/display-name': displayName }
        : undefined,
    },
    status: conditions ? { conditions, observedGeneration } : undefined,
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
      // No status written by the fixture, so the controller has not reconciled.
      readiness: 'pending',
    });
  });

  it('carries readiness and its explanation through from the conditions', () => {
    const agent = makeAgent({
      name: 'triager',
      conditions: [
        {
          type: 'Accepted',
          status: 'True',
          reason: 'Reconciled',
          message: 'Agent configuration accepted',
          lastTransitionTime: '2026-07-31T10:00:00Z',
        },
        {
          type: 'Ready',
          status: 'False',
          reason: 'DeploymentNotReady',
          message: 'Deployment is not ready, 0/1 pods are ready',
          lastTransitionTime: '2026-07-31T10:00:00Z',
        },
      ],
    });

    const row = toAgentRow(agent, []);
    expect(row.readiness).toBe('notReady');
    expect(row.readinessMessage).toBe(
      'Deployment is not ready, 0/1 pods are ready',
    );
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

describe('getAgentsRefetchInterval', () => {
  const BASELINE = 60_000;
  const FAST = 5_000;
  const NOW = Date.parse('2026-07-31T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** A query whose data is the raw list items for one installation. */
  function query(agents: Agent[]) {
    return {
      state: { data: agents.map(agent => agent.jsonData) },
    } as Parameters<typeof getAgentsRefetchInterval>[0];
  }

  function condition(
    type: string,
    status: 'True' | 'False' | 'Unknown',
    reason: string,
    ageMs = 0,
  ): AgentCondition {
    return {
      type,
      status,
      reason,
      message: '',
      lastTransitionTime: new Date(NOW - ageMs).toISOString(),
    };
  }

  const readyAgent = (name: string, ageMs = 0) =>
    makeAgent({
      name,
      conditions: [
        condition('Accepted', 'True', 'Reconciled', ageMs),
        condition('Ready', 'True', 'DeploymentReady', ageMs),
      ],
    });

  const notReadyAgent = (name: string, ageMs = 0) =>
    makeAgent({
      name,
      conditions: [
        condition('Accepted', 'True', 'Reconciled', ageMs),
        condition('Ready', 'False', 'DeploymentNotReady', ageMs),
      ],
    });

  it('uses the baseline interval when every agent is ready', () => {
    expect(
      getAgentsRefetchInterval(query([readyAgent('a'), readyAgent('b')])),
    ).toBe(BASELINE);
  });

  it('uses the baseline interval for an empty installation', () => {
    expect(getAgentsRefetchInterval(query([]))).toBe(BASELINE);
  });

  it('uses the baseline interval before the first fetch resolves', () => {
    const pending = { state: { data: undefined } } as Parameters<
      typeof getAgentsRefetchInterval
    >[0];

    expect(getAgentsRefetchInterval(pending)).toBe(BASELINE);
  });

  it('polls fast while an agent is still converging', () => {
    expect(
      getAgentsRefetchInterval(query([readyAgent('a'), notReadyAgent('b')])),
    ).toBe(FAST);
  });

  it('polls fast for an agent the controller has not reconciled yet', () => {
    const fresh = makeAgent({
      name: 'brand-new',
      creationTimestamp: new Date(NOW - 2_000).toISOString(),
    });

    expect(getAgentsRefetchInterval(query([fresh]))).toBe(FAST);
  });

  // The bound that stops a permanently broken agent pinning its installation to
  // the fast interval forever (which is what kagent's own UI does).
  it('backs off to the baseline for an agent stuck non-ready', () => {
    const stuck = notReadyAgent('stuck', 10 * 60_000);

    expect(getAgentsRefetchInterval(query([stuck]))).toBe(BASELINE);
  });

  it('still polls fast just inside the converging window', () => {
    const recent = notReadyAgent('recent', 2 * 60_000);

    expect(getAgentsRefetchInterval(query([recent]))).toBe(FAST);
  });

  // Documents a deliberate limit of the age bound: editing a long-broken agent
  // makes it `pending`, but the age basis is still its last *condition*
  // transition, which is old — so the fix is picked up on the baseline (within a
  // minute) rather than immediately. Accepted in exchange for keeping the bound
  // hard: a "pending always polls fast" rule would let a stalled controller
  // fast-poll forever, which is the failure mode this bound exists to prevent.
  it('keeps a long-broken agent on the baseline even after an edit', () => {
    const edited = makeAgent({
      name: 'stuck',
      generation: 2,
      observedGeneration: 1,
      conditions: [
        condition('Accepted', 'True', 'Reconciled', 10 * 60_000),
        condition('Ready', 'False', 'DeploymentNotReady', 10 * 60_000),
      ],
    });

    expect(edited.getReadiness()).toBe('pending');
    expect(getAgentsRefetchInterval(query([edited]))).toBe(BASELINE);
  });

  it('ignores a stuck agent when another one is actively converging', () => {
    const stuck = notReadyAgent('stuck', 10 * 60_000);
    const converging = notReadyAgent('converging', 5_000);

    expect(getAgentsRefetchInterval(query([stuck, converging]))).toBe(FAST);
  });
});

describe('sortAgentsBy', () => {
  const row = (name: string, overrides: Partial<AgentRow> = {}): AgentRow => ({
    ...toAgentRow(makeAgent({ name, displayName: name }), []),
    ...overrides,
  });

  const names = (rows: AgentRow[]) => rows.map(r => r.name);

  it('orders the status column by severity, worst first', () => {
    const rows = [
      row('ready-one', { readiness: 'ready' }),
      row('pending-one', { readiness: 'pending' }),
      row('rejected-one', { readiness: 'notAccepted' }),
      row('down-one', { readiness: 'notReady' }),
    ];

    expect(
      names(
        sortAgentsBy(rows, { column: 'readiness', direction: 'ascending' }),
      ),
    ).toEqual(['rejected-one', 'down-one', 'pending-one', 'ready-one']);
  });

  it('reverses the status order when descending', () => {
    const rows = [
      row('rejected-one', { readiness: 'notAccepted' }),
      row('ready-one', { readiness: 'ready' }),
    ];

    expect(
      names(
        sortAgentsBy(rows, { column: 'readiness', direction: 'descending' }),
      ),
    ).toEqual(['ready-one', 'rejected-one']);
  });

  it('breaks status ties by name so equal rows keep a stable order', () => {
    const rows = [
      row('zeta', { readiness: 'ready' }),
      row('alpha', { readiness: 'ready' }),
      row('mid', { readiness: 'ready' }),
    ];

    expect(
      names(
        sortAgentsBy(rows, { column: 'readiness', direction: 'ascending' }),
      ),
    ).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('sorts skills numerically, not as strings', () => {
    const rows = [
      row('ten', { skillCount: 10 }),
      row('two', { skillCount: 2 }),
      row('nine', { skillCount: 9 }),
    ];

    expect(
      names(sortAgentsBy(rows, { column: 'skills', direction: 'ascending' })),
    ).toEqual(['two', 'nine', 'ten']);
  });

  // The initial sort, which must reproduce the ordering the list had before it
  // became sortable (installation, then name).
  it('groups by installation and then name, matching the previous default', () => {
    const rows = [
      row('beta', { installation: 'inst-b' }),
      row('zeta', { installation: 'inst-a' }),
      row('alpha', { installation: 'inst-a' }),
    ];

    const sorted = sortAgentsBy(rows, {
      column: 'installation',
      direction: 'ascending',
    });

    expect(sorted.map(r => `${r.installation}:${r.name}`)).toEqual([
      'inst-a:alpha',
      'inst-a:zeta',
      'inst-b:beta',
    ]);
    expect(names(sorted)).toEqual(names(sortAgentRows(rows)));
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

describe('toAgentRow with a serving resolver', () => {
  const agent = makeAgent({
    name: 'triager',
    namespace: 'sre-team',
    modelConfig: 'qwen',
  });
  const modelConfigs = [
    makeModelConfig({
      name: 'qwen',
      namespace: 'sre-team',
      displayName: 'Qwen 3',
    }),
  ];
  const served: ServedModel = {
    id: 'installation-1/ollama//qwen3:0.6b',
    installation: 'installation-1',
    backend: 'ollama',
    name: 'qwen3:0.6b',
    readiness: 'idle',
    endpointHosts: ['172.21.0.1'],
  };

  it('carries the serving state of the model behind the agent, without the row object', () => {
    const resolve = jest.fn(() => ({
      installation: 'installation-1',
      backend: 'ollama' as const,
      readiness: 'idle' as const,
      name: 'qwen3:0.6b',
      message: 'Downloaded; not loaded.',
      model: served,
    }));

    const row = toAgentRow(agent, modelConfigs, resolve);

    expect(resolve).toHaveBeenCalledWith(modelConfigs[0]);
    expect(row.model).toBe('Qwen 3');
    expect(row.modelServing).toEqual({
      installation: 'installation-1',
      backend: 'ollama',
      readiness: 'idle',
      name: 'qwen3:0.6b',
      message: 'Downloaded; not loaded.',
    });
  });

  it('asks nothing when the ModelConfig is not found, and carries no state when the resolver has none', () => {
    const resolve = jest.fn(() => undefined);

    expect(toAgentRow(agent, [], resolve).modelServing).toBeUndefined();
    expect(resolve).not.toHaveBeenCalled();

    expect(toAgentRow(agent, modelConfigs, resolve).modelServing).toBe(
      undefined,
    );
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('resolves the ModelConfig itself by name and namespace', () => {
    expect(resolveModelConfig(agent, modelConfigs)).toBe(modelConfigs[0]);
    expect(
      resolveModelConfig(agent, [
        makeModelConfig({ name: 'qwen', namespace: 'elsewhere' }),
      ]),
    ).toBeUndefined();
    expect(resolveModelConfig(makeAgent({}), modelConfigs)).toBeUndefined();
  });
});
