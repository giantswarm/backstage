import { crds } from '@giantswarm/k8s-types';
import { Agent, getAgentStatusChangedAt, isAgentTransitional } from './Agent';

type AgentInterface = crds.kagent.v1alpha2.Agent;

function makeAgent(spec: Partial<AgentInterface> = {}): Agent {
  const json = {
    apiVersion: 'kagent.dev/v1alpha2',
    kind: 'Agent',
    metadata: { name: 'my-agent', namespace: 'team-a' },
    ...spec,
  } as AgentInterface;

  return new Agent(json, 'installation-1');
}

describe('Agent', () => {
  describe('getDisplayName', () => {
    it('prefers the display-name annotation', () => {
      const agent = makeAgent({
        metadata: {
          name: 'my-agent',
          namespace: 'team-a',
          annotations: { 'ui.giantswarm.io/display-name': 'Incident triager' },
        },
      });

      expect(agent.getDisplayName()).toBe('Incident triager');
    });

    it('falls back to the resource name when no annotation is set', () => {
      expect(makeAgent().getDisplayName()).toBe('my-agent');
    });
  });

  describe('getSkillRefs / getSkillCount', () => {
    it('reads skills from spec.skills.gitRefs', () => {
      const agent = makeAgent({
        spec: {
          skills: {
            gitRefs: [
              { url: 'https://github.com/giantswarm/skills', name: 'a' },
              { url: 'https://github.com/giantswarm/skills', name: 'b' },
            ],
          },
        },
      });

      expect(agent.getSkillRefs()).toHaveLength(2);
      expect(agent.getSkillCount()).toBe(2);
    });

    it('returns an empty list / zero when no skills are set', () => {
      const agent = makeAgent();

      expect(agent.getSkillRefs()).toEqual([]);
      expect(agent.getSkillCount()).toBe(0);
    });
  });

  describe('declarative fields', () => {
    it('reads description, model config and system message', () => {
      const agent = makeAgent({
        spec: {
          type: 'Declarative',
          description: 'Triages incidents',
          declarative: {
            modelConfig: 'sonnet-4-6',
            systemMessage: 'You triage incidents.',
          },
        },
      });

      expect(agent.getType()).toBe('Declarative');
      expect(agent.getDescription()).toBe('Triages incidents');
      expect(agent.getModelConfigName()).toBe('sonnet-4-6');
      expect(agent.getSystemMessage()).toBe('You triage incidents.');
    });

    it('returns undefined model config for BYO agents', () => {
      const agent = makeAgent({ spec: { type: 'BYO' } });

      expect(agent.getType()).toBe('BYO');
      expect(agent.getModelConfigName()).toBeUndefined();
      expect(agent.getSkillCount()).toBe(0);
    });
  });

  describe('tool references', () => {
    const agentWithTools = () =>
      makeAgent({
        spec: {
          declarative: {
            tools: [
              // The chart's muster gateway entry: an MCP server, all its tools.
              {
                type: 'McpServer',
                mcpServer: { name: 'muster', namespace: 'agentic-platform' },
              },
              // A restricted server, and one that omits `type` entirely — which
              // the CRD allows and the controller infers.
              {
                mcpServer: {
                  name: 'grafana',
                  toolNames: ['query', 'dashboards'],
                },
              },
              {
                type: 'Agent',
                agent: { name: 'sre-agent', namespace: 'kagent' },
              },
            ],
          },
        },
      } as Partial<AgentInterface>);

    it('returns every tool entry', () => {
      expect(agentWithTools().getTools()).toHaveLength(3);
    });

    // Keyed on the presence of `mcpServer`, not on `type`, which is optional.
    it('splits MCP server references out, including entries with no type', () => {
      const refs = agentWithTools().getMcpServerRefs();

      expect(refs.map(ref => ref.name)).toEqual(['muster', 'grafana']);
      expect(refs[0].namespace).toBe('agentic-platform');
      expect(refs[1].toolNames).toEqual(['query', 'dashboards']);
    });

    it('splits agent references out', () => {
      const refs = agentWithTools().getAgentRefs();

      expect(refs).toHaveLength(1);
      expect(refs[0].name).toBe('sre-agent');
    });

    it('returns empty lists when the agent declares no tools', () => {
      expect(makeAgent().getTools()).toEqual([]);
      expect(makeAgent().getMcpServerRefs()).toEqual([]);
      expect(makeAgent().getAgentRefs()).toEqual([]);
    });
  });

  describe('generation tracking', () => {
    it('reports the stored and observed generations', () => {
      const agent = makeAgent({
        metadata: { name: 'my-agent', namespace: 'team-a', generation: 4 },
        status: { observedGeneration: 3, conditions: [] },
      } as Partial<AgentInterface>);

      expect(agent.getGeneration()).toBe(4);
      expect(agent.getObservedGeneration()).toBe(3);
      expect(agent.isStale()).toBe(true);
    });

    it('is not stale once the controller catches up', () => {
      const agent = makeAgent({
        metadata: { name: 'my-agent', namespace: 'team-a', generation: 4 },
        status: { observedGeneration: 4, conditions: [] },
      } as Partial<AgentInterface>);

      expect(agent.isStale()).toBe(false);
    });

    // "Cannot tell" must not read as "stale" — see isAgentStatusStale.
    it('is not stale when the controller records no observedGeneration', () => {
      const agent = makeAgent({
        metadata: { name: 'my-agent', namespace: 'team-a', generation: 4 },
        status: { conditions: [] },
      } as Partial<AgentInterface>);

      expect(agent.getObservedGeneration()).toBeUndefined();
      expect(agent.isStale()).toBe(false);
    });
  });

  describe('readiness', () => {
    const AT = '2026-07-31T10:00:00Z';

    function condition(
      type: string,
      status: 'True' | 'False' | 'Unknown',
      reason: string,
      message = '',
    ) {
      return { type, status, reason, message, lastTransitionTime: AT };
    }

    function withStatus(
      conditions: ReturnType<typeof condition>[],
      { generation, observedGeneration } = {
        generation: 1,
        observedGeneration: 1,
      },
    ): Agent {
      return makeAgent({
        metadata: { name: 'my-agent', namespace: 'team-a', generation },
        status: { conditions, observedGeneration },
      } as Partial<AgentInterface>);
    }

    const accepted = () =>
      condition(
        'Accepted',
        'True',
        'Reconciled',
        'Agent configuration accepted',
      );

    it('is ready when accepted and the deployment is ready', () => {
      const agent = withStatus([
        accepted(),
        condition('Ready', 'True', 'DeploymentReady', 'Deployment is ready'),
      ]);

      expect(agent.getReadiness()).toBe('ready');
      expect(agent.getReadinessMessage()).toBeUndefined();
    });

    it('treats a sandbox WorkloadReady agent as ready', () => {
      const agent = withStatus([
        accepted(),
        condition('Ready', 'True', 'WorkloadReady', 'Workload is ready'),
      ]);

      expect(agent.getReadiness()).toBe('ready');
    });

    it('is notReady when the deployment has no available replica', () => {
      const agent = withStatus([
        accepted(),
        condition(
          'Ready',
          'False',
          'DeploymentNotReady',
          'Deployment is not ready, 0/1 pods are ready',
        ),
      ]);

      expect(agent.getReadiness()).toBe('notReady');
      expect(agent.getReadinessMessage()).toBe(
        'Deployment is not ready, 0/1 pods are ready',
      );
    });

    // The controller reports a missing Deployment as Ready=Unknown, and kagent's
    // REST API keys readiness on the *reason*, so this must not read as ready.
    it('is notReady when the deployment is missing (Ready=Unknown)', () => {
      const agent = withStatus([
        accepted(),
        condition('Ready', 'Unknown', 'DeploymentNotFound', 'not found'),
      ]);

      expect(agent.getReadiness()).toBe('notReady');
    });

    // Deliberate divergence from kagent's REST API, which also requires the
    // reason to be DeploymentReady/WorkloadReady. A future kagent adding a third
    // ready reason must not make a healthy fleet read as broken.
    it('is ready when Ready=True carries an unrecognised reason', () => {
      const agent = withStatus([
        accepted(),
        condition('Ready', 'True', 'StatefulSetReady', 'StatefulSet is ready'),
      ]);

      expect(agent.getReadiness()).toBe('ready');
    });

    it('is notAccepted when reconciliation failed, and surfaces the error', () => {
      const agent = withStatus([
        condition(
          'Accepted',
          'False',
          'ReconcileFailed',
          'model config "missing" not found',
        ),
        condition('Ready', 'True', 'DeploymentReady'),
      ]);

      expect(agent.getReadiness()).toBe('notAccepted');
      expect(agent.getReadinessMessage()).toBe(
        'model config "missing" not found',
      );
    });

    it('is pending when the controller has written no status yet', () => {
      expect(makeAgent().getReadiness()).toBe('pending');
    });

    it('is pending when the status lags the current generation', () => {
      const agent = withStatus(
        [
          accepted(),
          condition('Ready', 'True', 'DeploymentReady', 'Deployment is ready'),
        ],
        { generation: 4, observedGeneration: 3 },
      );

      // The conditions still say ready, but they describe the previous spec.
      expect(agent.getReadiness()).toBe('pending');
    });

    it('is not pending once the controller observes the current generation', () => {
      const agent = withStatus(
        [
          accepted(),
          condition('Ready', 'True', 'DeploymentReady', 'Deployment is ready'),
        ],
        { generation: 4, observedGeneration: 4 },
      );

      expect(agent.getReadiness()).toBe('ready');
    });

    // observedGeneration is optional in the CRD while metadata.generation always
    // exists, so treating "absent" as "stale" would make every agent on such an
    // installation read pending — hiding both healthy and broken agents.
    it('does not report pending when observedGeneration is absent', () => {
      const agent = makeAgent({
        metadata: { name: 'my-agent', namespace: 'team-a', generation: 3 },
        status: {
          conditions: [
            accepted(),
            condition(
              'Ready',
              'True',
              'DeploymentReady',
              'Deployment is ready',
            ),
          ],
        },
      } as Partial<AgentInterface>);

      expect(agent.getReadiness()).toBe('ready');
    });

    it('still surfaces a failure when observedGeneration is absent', () => {
      const agent = makeAgent({
        metadata: { name: 'my-agent', namespace: 'team-a', generation: 3 },
        status: {
          conditions: [
            condition('Accepted', 'False', 'ReconcileFailed', 'bad spec'),
          ],
        },
      } as Partial<AgentInterface>);

      expect(agent.getReadiness()).toBe('notAccepted');
      expect(agent.getReadinessMessage()).toBe('bad spec');
    });

    // The controller stamps observedGeneration even when reconciliation fails,
    // so a rejected spec must settle on notAccepted rather than stick at pending.
    it('reports a rejected current generation as notAccepted, not pending', () => {
      const agent = withStatus(
        [condition('Accepted', 'False', 'ReconcileFailed', 'bad spec')],
        { generation: 2, observedGeneration: 2 },
      );

      expect(agent.getReadiness()).toBe('notAccepted');
    });
  });

  describe('getUnsupportedFeaturesWarning', () => {
    it('returns the warning message when the condition is True', () => {
      const agent = makeAgent({
        status: {
          observedGeneration: 1,
          conditions: [
            {
              type: 'UnsupportedFeatures',
              status: 'True',
              reason: 'UnsupportedFeatures',
              message: 'memory is not supported by the go runtime',
              lastTransitionTime: '2026-07-31T10:00:00Z',
            },
          ],
        },
      } as Partial<AgentInterface>);

      expect(agent.getUnsupportedFeaturesWarning()).toBe(
        'memory is not supported by the go runtime',
      );
    });

    it('returns undefined when no warning is set', () => {
      expect(makeAgent().getUnsupportedFeaturesWarning()).toBeUndefined();
    });
  });

  describe('getAgentStatusChangedAt', () => {
    it('returns the most recent condition transition time', () => {
      const agent = makeAgent({
        status: {
          observedGeneration: 1,
          conditions: [
            {
              type: 'Accepted',
              status: 'True',
              reason: 'Reconciled',
              message: '',
              lastTransitionTime: '2026-07-31T10:00:00Z',
            },
            {
              type: 'Ready',
              status: 'False',
              reason: 'DeploymentNotReady',
              message: '',
              lastTransitionTime: '2026-07-31T10:05:00Z',
            },
          ],
        },
      } as Partial<AgentInterface>);

      expect(getAgentStatusChangedAt(agent.jsonData)).toBe(
        Date.parse('2026-07-31T10:05:00Z'),
      );
    });

    it('falls back to the creation timestamp when there are no conditions', () => {
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
      expect(isAgentTransitional('pending')).toBe(true);
    });
  });
});
