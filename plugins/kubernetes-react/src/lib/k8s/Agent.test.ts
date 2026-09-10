import {
  Agent,
  AgentHarnessCondition,
  AgentHarnessStatus,
  AgentTemplateInterface,
  decidingHarnessStatus,
  deriveHarnessReadiness,
  getAgentStatusChangedAt,
  HARNESS_LABEL,
  isAgentTransitional,
} from './Agent';

type AgentInterface = AgentTemplateInterface;

const AT = '2026-07-31T10:00:00Z';

function makeAgent(spec: Partial<AgentInterface> = {}): Agent {
  const json = {
    apiVersion: 'kagent.dev/v1alpha3',
    kind: 'AgentTemplate',
    metadata: { name: 'my-agent', namespace: 'team-a' },
    ...spec,
  } as AgentInterface;

  return new Agent(json, 'installation-1');
}

function condition(
  type: string,
  status: 'True' | 'False' | 'Unknown',
  reason: string,
  message = '',
  lastTransitionTime = AT,
): AgentHarnessCondition {
  return { type, status, reason, message, lastTransitionTime };
}

/** A Harness entry, `desiredRevision` defaulting to a compiled-and-current one. */
function harness(
  name: string,
  conditions: AgentHarnessCondition[],
  extra: Partial<AgentHarnessStatus> = {},
): AgentHarnessStatus {
  return {
    harness: name,
    desiredRevision: 'rev-1',
    latestSuccessfulRevision: 'rev-1',
    ...extra,
    conditions: conditions as AgentHarnessStatus['conditions'],
  };
}

const accepted = () =>
  condition('Accepted', 'True', 'Admitted', 'Template admitted');
const resolved = () =>
  condition('ResolvedRefs', 'True', 'Resolved', 'All references resolve');
const compatible = () =>
  condition('Compatible', 'True', 'Compatible', 'Configuration fits');
const ready = () =>
  condition('Ready', 'True', 'RevisionReady', 'Revision rev-1 is ready');

const readyHarness = () =>
  harness('kagent', [accepted(), resolved(), compatible(), ready()]);

/**
 * An agent labelled for the platform Harness, with the given entries
 * reconciled. `null` leaves the label or the observedGeneration out entirely
 * (an explicit `undefined` would take the default).
 */
function withHarnesses(
  harnesses: AgentHarnessStatus[],
  options: {
    generation?: number;
    observedGeneration?: number | null;
    label?: string | null;
  } = {},
): Agent {
  const generation = options.generation ?? 1;
  const observedGeneration =
    options.observedGeneration === null
      ? undefined
      : (options.observedGeneration ?? 1);
  const label =
    options.label === null ? undefined : (options.label ?? 'kagent');
  return makeAgent({
    metadata: {
      name: 'my-agent',
      namespace: 'team-a',
      generation,
      labels: label ? { [HARNESS_LABEL]: label } : undefined,
    },
    status: { harnesses, observedGeneration },
  } as Partial<AgentInterface>);
}

describe('Agent', () => {
  it('is the v1alpha3 AgentTemplate, single version', () => {
    expect(Agent.group).toBe('kagent.dev');
    expect(Agent.kind).toBe('AgentTemplate');
    expect(Agent.plural).toBe('agenttemplates');
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

  describe('spec fields', () => {
    it('reads description, model config, system prompt and its source', () => {
      const agent = makeAgent({
        spec: {
          description: 'Triages incidents',
          modelConfig: { name: 'sonnet-4-6' },
          systemPrompt: 'You triage incidents.',
        },
      });

      expect(agent.getDescription()).toBe('Triages incidents');
      expect(agent.getModelConfigName()).toBe('sonnet-4-6');
      expect(agent.getSystemMessage()).toBe('You triage incidents.');
      expect(agent.getSystemMessageSource()).toBeUndefined();
    });

    it('reports a ConfigMap-sourced prompt as a source, not as text', () => {
      const agent = makeAgent({
        spec: { systemPromptFrom: { name: 'prompts', key: 'triager.md' } },
      });

      expect(agent.getSystemMessage()).toBeUndefined();
      expect(agent.getSystemMessageSource()).toEqual({
        name: 'prompts',
        key: 'triager.md',
      });
    });

    it('reads the admission label', () => {
      expect(
        makeAgent({
          metadata: {
            name: 'my-agent',
            namespace: 'team-a',
            labels: { [HARNESS_LABEL]: 'kagent' },
          },
        }).getHarnessLabel(),
      ).toBe('kagent');
      expect(makeAgent().getHarnessLabel()).toBeUndefined();
    });
  });

  describe('skills', () => {
    const agentWithSkills = () =>
      makeAgent({
        spec: {
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
        },
      } as Partial<AgentInterface>);

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
      makeAgent({
        spec: {
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
              agent: {
                name: 'sre',
                description: 'Escalate to the SRE agent',
                templateRef: { name: 'sre-agent' },
              },
            },
          ],
        },
      } as Partial<AgentInterface>);

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

    it('splits agent references out', () => {
      const refs = agentWithTools().getAgentRefs();

      expect(refs).toHaveLength(1);
      expect(refs[0].templateRef.name).toBe('sre-agent');
    });

    it('returns empty lists when the agent declares no tools', () => {
      expect(makeAgent().getToolBindings()).toEqual([]);
      expect(makeAgent().getMcpBindings()).toEqual([]);
      expect(makeAgent().getAgentRefs()).toEqual([]);
    });
  });

  describe('generation tracking', () => {
    it('reports the stored and observed generations', () => {
      const agent = withHarnesses([readyHarness()], {
        generation: 4,
        observedGeneration: 3,
      });

      expect(agent.getGeneration()).toBe(4);
      expect(agent.getObservedGeneration()).toBe(3);
      expect(agent.isStale()).toBe(true);
    });

    it('is not stale once the controller catches up', () => {
      expect(
        withHarnesses([readyHarness()], {
          generation: 4,
          observedGeneration: 4,
        }).isStale(),
      ).toBe(false);
    });

    // "Cannot tell" must not read as "stale" — see isAgentStatusStale.
    it('is not stale when the controller records no observedGeneration', () => {
      const agent = withHarnesses([readyHarness()], {
        generation: 4,
        observedGeneration: null,
      });

      expect(agent.getObservedGeneration()).toBeUndefined();
      expect(agent.isStale()).toBe(false);
    });
  });

  describe('deriveHarnessReadiness', () => {
    it('is ready on Ready=True', () => {
      expect(deriveHarnessReadiness(readyHarness())).toBe('ready');
    });

    it('is failed on Accepted=False or Compatible=False', () => {
      expect(
        deriveHarnessReadiness(
          harness('kagent', [
            condition('Accepted', 'False', 'Rejected', 'label mismatch'),
          ]),
        ),
      ).toBe('failed');
      expect(
        deriveHarnessReadiness(
          harness('kagent', [
            accepted(),
            condition('Compatible', 'False', 'Incompatible', 'no HITL here'),
          ]),
        ),
      ).toBe('failed');
    });

    it('is progressing while accepted but not ready, whatever the revision says', () => {
      expect(
        deriveHarnessReadiness(
          harness(
            'kagent',
            [
              accepted(),
              condition('Ready', 'False', 'Compiling', 'compiling rev-2'),
            ],
            { desiredRevision: 'rev-2', latestSuccessfulRevision: 'rev-1' },
          ),
        ),
      ).toBe('progressing');
      // A first compile: nothing succeeded yet, Ready not written at all.
      expect(
        deriveHarnessReadiness(
          harness('kagent', [accepted()], {
            desiredRevision: 'rev-1',
            latestSuccessfulRevision: undefined,
          }),
        ),
      ).toBe('progressing');
    });

    it('is pending until the Harness has written an Accepted verdict', () => {
      expect(deriveHarnessReadiness(harness('kagent', []))).toBe('pending');
      expect(
        deriveHarnessReadiness(
          harness('kagent', [
            condition('Accepted', 'Unknown', 'Reconciling', 'looking'),
          ]),
        ),
      ).toBe('pending');
    });
  });

  describe('readiness', () => {
    it('is ready when the platform Harness reports the template ready', () => {
      const agent = withHarnesses([readyHarness()]);

      expect(agent.getReadiness()).toBe('ready');
      expect(agent.getReadinessMessage()).toBeUndefined();
      expect(agent.getDecidingHarness()?.name).toBe('kagent');
    });

    it('is notReady while the platform Harness compiles, and explains why', () => {
      const agent = withHarnesses([
        harness(
          'kagent',
          [
            accepted(),
            resolved(),
            compatible(),
            condition(
              'Ready',
              'False',
              'Compiling',
              'Compiling revision rev-2',
            ),
          ],
          { desiredRevision: 'rev-2', latestSuccessfulRevision: 'rev-1' },
        ),
      ]);

      expect(agent.getReadiness()).toBe('notReady');
      expect(agent.getReadinessMessage()).toBe('Compiling revision rev-2');
    });

    it('explains an unresolved reference ahead of the Ready condition', () => {
      const agent = withHarnesses([
        harness('kagent', [
          accepted(),
          condition(
            'ResolvedRefs',
            'False',
            'ModelConfigNotFound',
            'modelconfigs.kagent.dev "opus" not found',
          ),
          condition('Ready', 'False', 'NotReady', 'not ready'),
        ]),
      ]);

      expect(agent.getReadiness()).toBe('notReady');
      expect(agent.getReadinessMessage()).toBe(
        'modelconfigs.kagent.dev "opus" not found',
      );
    });

    it('is notAccepted when the platform Harness rejects the template, with the reason', () => {
      const agent = withHarnesses([
        harness('kagent', [
          accepted(),
          condition(
            'Compatible',
            'False',
            'Incompatible',
            'Dedicated sub-agents are not supported by this Harness',
          ),
        ]),
      ]);

      expect(agent.getReadiness()).toBe('notAccepted');
      expect(agent.getReadinessMessage()).toBe(
        'Dedicated sub-agents are not supported by this Harness',
      );
    });

    // The state of its own: nothing changes without a spec edit, so it must
    // never look like a `pending` that will resolve.
    it('is notAdmitted when the controller has seen the spec and no Harness admits it', () => {
      const agent = withHarnesses([], { label: null });

      expect(agent.getReadiness()).toBe('notAdmitted');
      expect(agent.getReadinessMessage()).toBe(
        `No Harness admits this agent: it carries no ${HARNESS_LABEL} label.`,
      );
      expect(agent.getHarnesses()).toEqual([]);
      expect(agent.getConditions()).toBeUndefined();
    });

    it('names the label when it is set but selects no Harness', () => {
      const agent = withHarnesses([], { label: 'claude' });

      expect(agent.getReadiness()).toBe('notAdmitted');
      expect(agent.getReadinessMessage()).toBe(
        `No Harness admits this agent: the label ${HARNESS_LABEL}=claude selects none.`,
      );
    });

    it('stays pending with no Harness entry until the controller has caught up', () => {
      // No status at all.
      expect(makeAgent().getReadiness()).toBe('pending');
      // Entries empty, but the controller last looked at an older spec.
      expect(
        withHarnesses([], {
          generation: 2,
          observedGeneration: 1,
        }).getReadiness(),
      ).toBe('pending');
      // Entries empty and no observedGeneration recorded: cannot tell.
      expect(
        withHarnesses([], { observedGeneration: null }).getReadiness(),
      ).toBe('pending');
    });

    it('is pending when the status lags the current generation', () => {
      const agent = withHarnesses([readyHarness()], {
        generation: 5,
        observedGeneration: 4,
      });

      expect(agent.getReadiness()).toBe('pending');
    });

    it('does not report pending when observedGeneration is absent but a Harness reports', () => {
      expect(
        withHarnesses([readyHarness()], {
          observedGeneration: null,
        }).getReadiness(),
      ).toBe('ready');
    });

    it('is pending while an admitting Harness has not written its verdict', () => {
      expect(withHarnesses([harness('kagent', [])]).getReadiness()).toBe(
        'pending',
      );
    });

    it('lets the labelled platform Harness decide even when another Harness is ready', () => {
      const agent = withHarnesses([
        harness('claude', [accepted(), ready()]),
        harness('kagent', [
          accepted(),
          condition('Ready', 'False', 'Compiling', 'compiling'),
        ]),
      ]);

      expect(agent.getReadiness()).toBe('notReady');
      expect(agent.getDecidingHarness()?.name).toBe('kagent');
      // The deciding Harness leads the list.
      expect(agent.getHarnesses().map(h => h.name)).toEqual([
        'kagent',
        'claude',
      ]);
    });

    it('falls back to the readiest Harness when the label names none of them', () => {
      const agent = withHarnesses(
        [
          harness('claude', [condition('Accepted', 'False', 'Rejected', 'no')]),
          harness('codex', [accepted(), ready()]),
        ],
        { label: 'kagent' },
      );

      expect(decidingHarnessStatus(agent.jsonData)?.harness).toBe('codex');
      expect(agent.getReadiness()).toBe('ready');
    });
  });

  describe('getHarnesses', () => {
    it('reports each Harness with its verdict, revisions and warnings', () => {
      const agent = withHarnesses([
        harness('kagent', [accepted(), ready()], {
          warnings: ['memory tools downgraded'],
        }),
      ]);

      expect(agent.getHarnesses()).toEqual([
        {
          name: 'kagent',
          readiness: 'ready',
          warnings: ['memory tools downgraded'],
          desiredRevision: 'rev-1',
          latestSuccessfulRevision: 'rev-1',
          conditions: [accepted(), ready()],
        },
      ]);
    });
  });

  describe('getHarnessWarnings', () => {
    it('returns the warnings, prefixed by the Harness only when several admit the template', () => {
      expect(
        withHarnesses([
          harness('kagent', [ready()], { warnings: ['a', 'b'] }),
        ]).getHarnessWarnings(),
      ).toEqual(['a', 'b']);
      expect(
        withHarnesses([
          harness('kagent', [ready()], { warnings: ['a'] }),
          harness('claude', [ready()], { warnings: ['c'] }),
        ]).getHarnessWarnings(),
      ).toEqual(['kagent: a', 'claude: c']);
    });

    it('returns nothing when no Harness warns', () => {
      expect(withHarnesses([readyHarness()]).getHarnessWarnings()).toEqual([]);
    });
  });

  describe('getAgentStatusChangedAt', () => {
    it('returns the most recent transition time across every Harness', () => {
      const agent = withHarnesses([
        harness('kagent', [
          condition('Accepted', 'True', 'Admitted', '', '2026-07-31T10:00:00Z'),
          condition('Ready', 'False', 'Compiling', '', '2026-07-31T10:05:00Z'),
        ]),
        harness('claude', [
          condition('Accepted', 'True', 'Admitted', '', '2026-07-31T10:02:00Z'),
        ]),
      ]);

      expect(getAgentStatusChangedAt(agent.jsonData)).toBe(
        Date.parse('2026-07-31T10:05:00Z'),
      );
    });

    it('falls back to the creation timestamp when no Harness has reported', () => {
      const agent = makeAgent({
        metadata: {
          name: 'my-agent',
          namespace: 'team-a',
          creationTimestamp: '2026-07-31T09:00:00Z',
        },
      } as Partial<AgentInterface>);

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
      expect(isAgentTransitional('notAccepted')).toBe(true);
      expect(isAgentTransitional('notAdmitted')).toBe(true);
      expect(isAgentTransitional('pending')).toBe(true);
    });
  });
});
