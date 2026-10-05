import {
  Agent,
  AgentCondition,
  AgentInterface,
  AgentTemplateSpec,
  failureFieldOf,
  getAgentStatusChangedAt,
  isAgentTransitional,
} from './Agent';

const AT = '2026-07-31T10:00:00Z';

function makeAgent(spec: Partial<AgentInterface> = {}): Agent {
  const json = {
    apiVersion: 'api.kagent.dev/v1alpha3',
    kind: 'Agent',
    metadata: { name: 'my-agent', namespace: 'team-a' },
    ...spec,
  } as AgentInterface;

  return new Agent(json, 'installation-1');
}

/** An agent with the template inline and the platform Harness by name. */
function withTemplate(template: AgentTemplateSpec): Agent {
  return makeAgent({
    spec: { template, harnessRef: { name: 'kagent' } },
  });
}

function condition(
  type: string,
  status: 'True' | 'False' | 'Unknown',
  reason: string,
  message = '',
  lastTransitionTime = AT,
): AgentCondition {
  return { type, status, reason, message, lastTransitionTime };
}

const accepted = () =>
  condition('Accepted', 'True', 'Admitted', 'Template admitted');
const resolved = () =>
  condition('ResolvedRefs', 'True', 'Resolved', 'All references resolve');
const compatible = () =>
  condition('Compatible', 'True', 'Compatible', 'Configuration fits');
const ready = () =>
  condition('Ready', 'True', 'RevisionReady', 'Revision rev-1 is ready');

const readyConditions = () => [accepted(), resolved(), compatible(), ready()];

/**
 * An agent on the platform Harness with the given conditions reconciled.
 * `null` leaves the observedGeneration out entirely (an explicit `undefined`
 * would take the default).
 */
function withConditions(
  conditions: AgentCondition[],
  options: {
    generation?: number;
    observedGeneration?: number | null;
    desiredRevision?: string;
    latestSuccessfulRevision?: string;
    warnings?: string[];
  } = {},
): Agent {
  const generation = options.generation ?? 1;
  const observedGeneration =
    options.observedGeneration === null
      ? undefined
      : (options.observedGeneration ?? 1);
  return makeAgent({
    metadata: { name: 'my-agent', namespace: 'team-a', generation },
    spec: { template: {}, harnessRef: { name: 'kagent' } },
    status: {
      conditions,
      observedGeneration,
      desiredRevision: options.desiredRevision ?? 'rev-1',
      latestSuccessfulRevision: options.latestSuccessfulRevision ?? 'rev-1',
      ...(options.warnings && { warnings: options.warnings }),
    },
  } as Partial<AgentInterface>);
}

describe('Agent', () => {
  it('is the api.kagent.dev/v1alpha3 Agent, single version', () => {
    expect(Agent.group).toBe('api.kagent.dev');
    expect(Agent.kind).toBe('Agent');
    expect(Agent.plural).toBe('agents');
    expect(Agent.supportedVersions).toEqual(['v1alpha3']);
  });

  describe('getDisplayName / getIconUrl', () => {
    it('prefers the display-name annotation', () => {
      const agent = makeAgent({
        metadata: {
          name: 'my-agent',
          namespace: 'team-a',
          annotations: {
            'ui.giantswarm.io/display-name': 'Incident triager',
            'ui.giantswarm.io/icon-url': 'https://avatars.example/triager.png',
          },
        },
      });

      expect(agent.getDisplayName()).toBe('Incident triager');
      expect(agent.getIconUrl()).toBe('https://avatars.example/triager.png');
    });

    it('falls back to the resource name when no annotation is set', () => {
      expect(makeAgent().getDisplayName()).toBe('my-agent');
      expect(makeAgent().getIconUrl()).toBeUndefined();
    });
  });

  describe('template and Harness references', () => {
    it('reads the Harness the agent names', () => {
      expect(withTemplate({}).getHarnessName()).toBe('kagent');
      expect(withTemplate({}).getTemplateRef()).toBeUndefined();
    });

    it('reads a template by name and answers nothing for its fields', () => {
      const agent = makeAgent({
        spec: {
          templateRef: { name: 'shared-triager' },
          harnessRef: { name: 'claude' },
        },
      });

      expect(agent.getTemplate()).toBeUndefined();
      expect(agent.getTemplateRef()).toBe('shared-triager');
      expect(agent.getHarnessName()).toBe('claude');
      expect(agent.getDescription()).toBeUndefined();
      expect(agent.getModelConfigName()).toBeUndefined();
      expect(agent.getSkills()).toEqual([]);
      expect(agent.getToolBindings()).toEqual([]);
    });

    it('has no Harness name when the Harness is inline', () => {
      const agent = makeAgent({
        spec: {
          template: {},
          harness: {
            claude: {},
            workload: { image: `img@sha256:${'a'.repeat(64)}` },
            substrate: {
              workerPoolRef: { name: 'pool' },
              snapshotPolicy: { location: 's3://snapshots' },
            },
          },
        },
      } as Partial<AgentInterface>);

      expect(agent.getHarnessName()).toBeUndefined();
    });
  });

  describe('spec fields', () => {
    it('reads description, model config, system prompt and its source', () => {
      const agent = withTemplate({
        description: 'Triages incidents',
        modelConfig: { name: 'sonnet-4-6' },
        systemPrompt: 'You triage incidents.',
      });

      expect(agent.getDescription()).toBe('Triages incidents');
      expect(agent.getModelConfigName()).toBe('sonnet-4-6');
      expect(agent.getSystemMessage()).toBe('You triage incidents.');
      expect(agent.getSystemMessageSource()).toBeUndefined();
    });

    it('reports a ConfigMap-sourced prompt as a source, not as text', () => {
      const agent = withTemplate({
        systemPromptFrom: { name: 'prompts', key: 'triager.md' },
      });

      expect(agent.getSystemMessage()).toBeUndefined();
      expect(agent.getSystemMessageSource()).toEqual({
        name: 'prompts',
        key: 'triager.md',
      });
    });
  });

  describe('skills', () => {
    const agentWithSkills = () =>
      withTemplate({
        skills: [
          {
            name: 'pr-review',
            source: {
              git: {
                url: 'https://github.com/giantswarm/skills',
                commit: '0123456789abcdef0123456789abcdef01234567',
              },
              path: 'skills/pr-review',
            },
          },
          {
            name: 'runbooks',
            source: {
              oci: `gsoci.azurecr.io/giantswarm/skills@sha256:${'a'.repeat(64)}`,
            },
          },
          {
            name: 'archive',
            source: {
              bucket: {
                s3: {
                  endpoint: 'https://s3.example',
                  bucket: 'skills',
                  key: 'archive.tar',
                  versionId: 'v-42',
                },
              },
              path: 'archive',
            },
          },
        ],
      } as AgentTemplateSpec);

    it('flattens every source kind with its pin', () => {
      expect(agentWithSkills().getSkills()).toEqual([
        {
          name: 'pr-review',
          source: 'git',
          url: 'https://github.com/giantswarm/skills',
          path: 'skills/pr-review',
          pin: '0123456789abcdef0123456789abcdef01234567',
        },
        {
          name: 'runbooks',
          source: 'oci',
          url: 'gsoci.azurecr.io/giantswarm/skills',
          pin: `sha256:${'a'.repeat(64)}`,
        },
        {
          name: 'archive',
          source: 'bucket',
          url: 'https://s3.example/skills/archive.tar',
          path: 'archive',
          pin: 'v-42',
        },
      ]);
      expect(agentWithSkills().getSkillCount()).toBe(3);
    });

    it('returns an empty list / zero when no skills are set', () => {
      expect(makeAgent().getSkills()).toEqual([]);
      expect(makeAgent().getSkillCount()).toBe(0);
    });
  });

  describe('tool bindings', () => {
    const agentWithTools = () =>
      withTemplate({
        tools: [
          // The chart's per-agent gateway carrier: an MCP server, all its tools.
          { mcp: { server: { kind: 'RemoteMCPServer', name: 'my-agent' } } },
          // A server narrowed to two tools, calls needing approval.
          {
            mcp: {
              server: { kind: 'RemoteMCPServer', name: 'grafana' },
              tools: ['query', 'dashboards'],
              requireApproval: true,
            },
          },
          {
            subAgent: {
              name: 'sre',
              description: 'Escalate to the SRE agent',
              templateRef: { name: 'sre-agent' },
            },
          },
        ],
      } as AgentTemplateSpec);

    it('returns every binding', () => {
      expect(agentWithTools().getToolBindings()).toHaveLength(3);
    });

    it('splits MCP bindings out', () => {
      const bindings = agentWithTools().getMcpBindings();

      expect(bindings.map(binding => binding.server.name)).toEqual([
        'my-agent',
        'grafana',
      ]);
      expect(bindings[1].tools).toEqual(['query', 'dashboards']);
      expect(bindings[1].requireApproval).toBe(true);
    });

    it('splits sub-agent bindings out', () => {
      const refs = agentWithTools().getSubAgentBindings();

      expect(refs).toHaveLength(1);
      expect(refs[0].templateRef.name).toBe('sre-agent');
    });

    it('returns empty lists when the agent declares no tools', () => {
      expect(makeAgent().getToolBindings()).toEqual([]);
      expect(makeAgent().getMcpBindings()).toEqual([]);
      expect(makeAgent().getSubAgentBindings()).toEqual([]);
    });
  });

  describe('generation tracking', () => {
    it('reports the stored and observed generations', () => {
      const agent = withConditions(readyConditions(), {
        generation: 4,
        observedGeneration: 3,
      });

      expect(agent.getGeneration()).toBe(4);
      expect(agent.getObservedGeneration()).toBe(3);
      expect(agent.isStale()).toBe(true);
    });

    it('is not stale once the controller catches up', () => {
      expect(
        withConditions(readyConditions(), {
          generation: 4,
          observedGeneration: 4,
        }).isStale(),
      ).toBe(false);
    });

    // "Cannot tell" must not read as "stale" — see isAgentStatusStale.
    it('is not stale when the controller records no observedGeneration', () => {
      const agent = withConditions(readyConditions(), {
        generation: 4,
        observedGeneration: null,
      });

      expect(agent.getObservedGeneration()).toBeUndefined();
      expect(agent.isStale()).toBe(false);
    });

    it('reads the revisions', () => {
      const agent = withConditions(readyConditions(), {
        desiredRevision: 'rev-2',
        latestSuccessfulRevision: 'rev-1',
      });

      expect(agent.getDesiredRevision()).toBe('rev-2');
      expect(agent.getLatestSuccessfulRevision()).toBe('rev-1');
    });
  });

  describe('readiness', () => {
    it('is ready when the controller reports the agent ready', () => {
      const agent = withConditions(readyConditions());

      expect(agent.getReadiness()).toBe('ready');
      expect(agent.getReadinessMessage()).toBeUndefined();
    });

    it('is notReady while the Harness compiles, and explains why', () => {
      const agent = withConditions(
        [
          accepted(),
          resolved(),
          compatible(),
          condition(
            'Ready',
            'False',
            'Preparing',
            'Preparing the golden snapshot',
          ),
        ],
        { desiredRevision: 'rev-2', latestSuccessfulRevision: 'rev-1' },
      );

      expect(agent.getReadiness()).toBe('notReady');
      expect(agent.getReadinessMessage()).toBe('Preparing the golden snapshot');
    });

    it('explains an unresolved reference ahead of the Ready condition', () => {
      const agent = withConditions([
        accepted(),
        condition(
          'ResolvedRefs',
          'Unknown',
          'Resolving',
          'Waiting for ModelConfig "sonnet"',
        ),
        condition('Ready', 'False', 'Blocked', 'blocked by ResolvedRefs'),
      ]);

      expect(agent.getReadiness()).toBe('notReady');
      expect(agent.getReadinessMessage()).toBe(
        'Waiting for ModelConfig "sonnet"',
      );
    });

    it('is failed when the Harness cannot run the agent, with the reason', () => {
      const agent = withConditions([
        condition(
          'Accepted',
          'False',
          'Rejected',
          'Harness "kagent" runs no Claude templates',
        ),
        condition('Ready', 'False', 'Blocked', 'blocked by Accepted'),
      ]);

      expect(agent.getReadiness()).toBe('failed');
      expect(agent.getReadinessMessage()).toBe(
        'Harness "kagent" runs no Claude templates',
      );
    });

    it('is failed on an unresolved reference and names it', () => {
      const agent = withConditions([
        accepted(),
        condition(
          'ResolvedRefs',
          'False',
          'ReferenceResolutionFailed',
          'resolve ModelConfig "qwen3-4b-instruct": not found',
        ),
        condition('Compatible', 'False', 'Blocked', 'blocked by ResolvedRefs'),
        condition('Ready', 'False', 'Blocked', 'blocked by ResolvedRefs'),
      ]);

      expect(agent.getReadiness()).toBe('failed');
      expect(agent.getReadinessMessage()).toBe(
        'resolve ModelConfig "qwen3-4b-instruct": not found',
      );
    });

    it('keeps the rejection reason when the reference check is still unknown', () => {
      const agent = withConditions([
        accepted(),
        condition('ResolvedRefs', 'Unknown', 'Resolving', 'still resolving'),
        condition(
          'Compatible',
          'False',
          'UnsupportedConfiguration',
          'Dedicated sub-agents are not supported by this Harness',
        ),
      ]);

      expect(agent.getReadiness()).toBe('failed');
      expect(agent.getReadinessMessage()).toBe(
        'Dedicated sub-agents are not supported by this Harness',
      );
    });

    it('is pending until the controller has written conditions', () => {
      const agent = withConditions([], { observedGeneration: null });

      expect(agent.getReadiness()).toBe('pending');
      expect(agent.getReadinessMessage()).toBeUndefined();
      expect(agent.getConditions()).toEqual([]);
    });

    it('is pending when the status lags the current generation', () => {
      const agent = withConditions(readyConditions(), {
        generation: 3,
        observedGeneration: 2,
      });

      expect(agent.getReadiness()).toBe('pending');
    });

    it('does not report pending when observedGeneration is absent but the controller reports', () => {
      expect(
        withConditions(readyConditions(), {
          observedGeneration: null,
        }).getReadiness(),
      ).toBe('ready');
    });

    it('is pending while no Accepted verdict is written', () => {
      expect(
        withConditions([
          condition('Ready', 'Unknown', 'Pending', ''),
        ]).getReadiness(),
      ).toBe('pending');
    });
  });

  describe('getHarnessWarnings', () => {
    it('returns the warnings', () => {
      expect(
        withConditions(readyConditions(), {
          warnings: ['memory disabled'],
        }).getHarnessWarnings(),
      ).toEqual(['memory disabled']);
    });

    it('returns nothing when the Harness does not warn', () => {
      expect(withConditions(readyConditions()).getHarnessWarnings()).toEqual(
        [],
      );
    });
  });

  describe('getAgentStatusChangedAt', () => {
    it('returns the most recent transition time across the conditions', () => {
      const agent = withConditions([
        condition('Accepted', 'True', 'Admitted', '', '2026-07-31T10:00:00Z'),
        condition('Ready', 'True', 'RevisionReady', '', '2026-07-31T10:05:00Z'),
      ]);

      expect(getAgentStatusChangedAt(agent.jsonData)).toBe(
        Date.parse('2026-07-31T10:05:00Z'),
      );
    });

    it('falls back to the creation timestamp when the controller has not reported', () => {
      const agent = makeAgent({
        metadata: {
          name: 'my-agent',
          namespace: 'team-a',
          creationTimestamp: '2026-07-31T09:00:00Z',
        },
      });

      expect(getAgentStatusChangedAt(agent.jsonData)).toBe(
        Date.parse('2026-07-31T09:00:00Z'),
      );
    });

    it('returns undefined when neither is available', () => {
      expect(getAgentStatusChangedAt(makeAgent().jsonData)).toBeUndefined();
    });
  });

  describe('isAgentTransitional', () => {
    it('treats every non-ready state as transitional', () => {
      expect(isAgentTransitional('ready')).toBe(false);
      expect(isAgentTransitional('notReady')).toBe(true);
      expect(isAgentTransitional('failed')).toBe(true);
      expect(isAgentTransitional('pending')).toBe(true);
    });
  });

  describe('failureFieldOf', () => {
    it.each([
      ['resolve ModelConfig "qwen3-4b-instruct": not found', 'model'],
      ['resolve ModelConfig "opus": provider secret missing', 'model'],
      ['resolve RemoteMCPServer "factory-analyst": not found', 'tools'],
      ['resolve MCPServer "github": not found', 'tools'],
      ['resolve AgentTemplate "helper": not found', 'tools'],
      [
        'resolve systemPromptFrom: ConfigMap "prompt" not found',
        'systemPrompt',
      ],
      ['resolve prompt source "rules": ConfigMap not found', 'systemPrompt'],
      ['resolve prompt sources: boom', 'systemPrompt'],
      ['WorkerPool "kagent/default" not found', 'platform'],
      ['resolve Harness "claude" not found', 'platform'],
    ])('reads %j as %s', (message, field) => {
      expect(failureFieldOf(message)).toBe(field);
    });

    it.each([
      [undefined],
      [''],
      ['Dedicated sub-agents are not supported by this Harness'],
      ['blocked by ResolvedRefs'],
      // The memory model is not the Model row's ModelConfig.
      ['resolve memory ModelConfig "embed": not found'],
    ])('names no field for %j', message => {
      expect(failureFieldOf(message)).toBeUndefined();
    });
  });

  describe('getFailure', () => {
    // What kagent writes when a reference does not resolve: Accepted stays
    // True, every later stage is Blocked, and all share one timestamp.
    const unresolvedModel = () =>
      withConditions([
        accepted(),
        condition('Compatible', 'False', 'Blocked', 'blocked by ResolvedRefs'),
        condition('Ready', 'False', 'Blocked', 'blocked by ResolvedRefs'),
        condition(
          'ResolvedRefs',
          'False',
          'ReferenceResolutionFailed',
          'resolve ModelConfig "qwen3-4b-instruct": not found',
        ),
      ]);

    it('names the unresolved reference as the root cause, not the stages it blocks', () => {
      expect(unresolvedModel().getFailure()).toEqual({
        condition: 'ResolvedRefs',
        message: 'resolve ModelConfig "qwen3-4b-instruct": not found',
        field: 'model',
      });
    });

    it('names an incompatible configuration without a field', () => {
      const agent = withConditions([
        accepted(),
        resolved(),
        condition(
          'Compatible',
          'False',
          'UnsupportedConfiguration',
          'Dedicated sub-agents are not supported by this Harness',
        ),
        condition('Ready', 'False', 'Blocked', 'blocked by Compatible'),
      ]);

      expect(agent.getFailure()).toEqual({
        condition: 'Compatible',
        message: 'Dedicated sub-agents are not supported by this Harness',
        field: undefined,
      });
    });

    it('falls back to the first failing stage when every failure reads Blocked', () => {
      const agent = withConditions([
        accepted(),
        condition('Compatible', 'False', 'Blocked', 'blocked by ResolvedRefs'),
      ]);

      expect(agent.getFailure()?.condition).toBe('Compatible');
    });

    it('is undefined for an agent that is not failed', () => {
      expect(withConditions(readyConditions()).getFailure()).toBeUndefined();
      expect(withConditions([]).getFailure()).toBeUndefined();
    });
  });
});
