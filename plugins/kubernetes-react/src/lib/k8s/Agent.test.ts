import {
  Agent,
  AgentTemplateHarnessStatus,
  AgentTemplateInterface,
  deriveAgentReadiness,
  getAgentStatusChangedAt,
  isAgentTransitional,
} from './Agent';

function harness(
  name: string,
  conditions: Array<{ type: string; status: string; message?: string }>,
  extra: Partial<AgentTemplateHarnessStatus> = {},
): AgentTemplateHarnessStatus {
  return {
    harness: name,
    conditions: conditions.map(condition => ({
      ...condition,
      lastTransitionTime: '2026-09-09T15:31:32Z',
    })),
    ...extra,
  };
}

const READY = [
  { type: 'Accepted', status: 'True' },
  { type: 'ResolvedRefs', status: 'True' },
  { type: 'Compatible', status: 'True' },
  { type: 'Ready', status: 'True' },
];

function makeAgent(spec: Partial<AgentTemplateInterface> = {}): Agent {
  const json = {
    apiVersion: 'kagent.dev/v1alpha3',
    kind: 'AgentTemplate',
    metadata: {
      name: 'my-agent',
      namespace: 'kagent',
      labels: { 'kagent.dev/harness': 'kagent' },
    },
    ...spec,
  } as AgentTemplateInterface;
  return new Agent(json, 'installation-1');
}

describe('Agent (v1alpha3 AgentTemplate)', () => {
  it('is the AgentTemplate kind of kagent.dev/v1alpha3', () => {
    expect(Agent.group).toBe('kagent.dev');
    expect(Agent.kind).toBe('AgentTemplate');
    expect(Agent.plural).toBe('agenttemplates');
    expect(Agent.supportedVersions).toEqual(['v1alpha3']);
  });

  describe('getDisplayName', () => {
    it('prefers the display-name annotation', () => {
      const agent = makeAgent({
        metadata: {
          name: 'my-agent',
          namespace: 'kagent',
          annotations: { 'ui.giantswarm.io/display-name': 'Incident triager' },
        },
      });
      expect(agent.getDisplayName()).toBe('Incident triager');
    });

    it('falls back to the resource name when no annotation is set', () => {
      expect(makeAgent().getDisplayName()).toBe('my-agent');
    });
  });

  describe('spec getters', () => {
    it('reads the model config, prompt and description off the template spec', () => {
      const agent = makeAgent({
        spec: {
          modelConfig: { name: 'default-model-config' },
          description: 'Muster, whole server',
          systemPrompt: 'Reply briefly.',
        },
      });
      expect(agent.getModelConfigName()).toBe('default-model-config');
      expect(agent.getDescription()).toBe('Muster, whole server');
      expect(agent.getSystemMessage()).toBe('Reply briefly.');
      expect(agent.getType()).toBe('Declarative');
    });

    it('renders skills as url/ref/path refs', () => {
      const agent = makeAgent({
        spec: {
          skills: [
            {
              name: 'triage',
              source: {
                git: {
                  url: 'https://github.com/giantswarm/skills',
                  commit: 'a'.repeat(40),
                },
                path: 'skills/triage',
              },
            },
            { name: 'oci-skill', source: { oci: 'ghcr.io/x/skill:1' } },
          ],
        },
      });
      expect(agent.getSkillRefs()).toEqual([
        {
          name: 'triage',
          url: 'https://github.com/giantswarm/skills',
          ref: 'a'.repeat(40),
          path: 'skills/triage',
          source: 'git',
        },
        { name: 'oci-skill', url: 'ghcr.io/x/skill:1', source: 'oci' },
      ]);
      expect(agent.getSkillCount()).toBe(2);
    });

    it('returns an empty list / zero when no skills are set', () => {
      expect(makeAgent().getSkillRefs()).toEqual([]);
      expect(makeAgent().getSkillCount()).toBe(0);
    });

    it('renders tool bindings in the mcpServer / agent vocabulary', () => {
      const agent = makeAgent({
        spec: {
          tools: [
            { mcp: { server: { kind: 'RemoteMCPServer', name: 'muster' } } },
            {
              mcp: {
                server: { kind: 'RemoteMCPServer', name: 'muster-x' },
                tools: ['list_pods'],
              },
            },
            {
              agent: {
                name: 'helper',
                description: 'Delegates',
                templateRef: { name: 'helper-template' },
              },
            },
          ],
        },
      });
      expect(agent.getMcpServerRefs()).toEqual([
        { kind: 'RemoteMCPServer', name: 'muster' },
        { kind: 'RemoteMCPServer', name: 'muster-x', toolNames: ['list_pods'] },
      ]);
      expect(agent.getAgentRefs()).toEqual([
        { name: 'helper-template', description: 'Delegates' },
      ]);
      expect(agent.getTools().every(tool => tool.headersFrom === undefined)).toBe(
        true,
      );
    });
  });

  describe('readiness', () => {
    it('is pending before the controller has written a status', () => {
      expect(makeAgent().getReadiness()).toBe('pending');
    });

    it('is notAccepted once reconciled with no admitting harness', () => {
      const agent = makeAgent({
        metadata: { name: 'my-agent', namespace: 'kagent', generation: 1 },
        status: { observedGeneration: 1, harnesses: [] },
      });
      expect(agent.getReadiness()).toBe('notAccepted');
      expect(agent.getReadinessMessage()).toContain('kagent.dev/harness');
    });

    it('is ready when any harness reports Ready=True', () => {
      const agent = makeAgent({
        status: {
          observedGeneration: 1,
          harnesses: [
            harness('claude', [
              { type: 'Accepted', status: 'True' },
              { type: 'Ready', status: 'False', message: 'preparing' },
            ]),
            harness('kagent', READY),
          ],
        },
      });
      expect(agent.getReadiness()).toBe('ready');
      expect(agent.getReadinessMessage()).toBeUndefined();
      expect(agent.getHarnesses()).toEqual([
        { name: 'kagent', ready: true, warnings: [] },
        { name: 'claude', ready: false, warnings: [] },
      ]);
      expect(agent.getReadyHarnessNames()).toEqual(['kagent']);
      // The Ready harness explains the state.
      expect(agent.getConditions()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'Ready', status: 'True' }),
        ]),
      );
    });

    it('is notReady while an admitting harness is still preparing, with its message', () => {
      const agent = makeAgent({
        status: {
          observedGeneration: 1,
          harnesses: [
            harness('kagent', [
              { type: 'Accepted', status: 'True' },
              { type: 'ResolvedRefs', status: 'True' },
              { type: 'Compatible', status: 'True' },
              {
                type: 'Ready',
                status: 'False',
                message: 'ActorTemplate golden snapshot is pending',
              },
            ]),
          ],
        },
      });
      expect(agent.getReadiness()).toBe('notReady');
      expect(agent.getReadinessMessage()).toBe(
        'ActorTemplate golden snapshot is pending',
      );
    });

    it('is notReady with the unresolved reference when refs do not resolve', () => {
      const agent = makeAgent({
        status: {
          observedGeneration: 1,
          harnesses: [
            harness('kagent', [
              { type: 'Accepted', status: 'True' },
              {
                type: 'ResolvedRefs',
                status: 'False',
                message: 'ModelConfig "missing" not found',
              },
              { type: 'Ready', status: 'False' },
            ]),
          ],
        },
      });
      expect(agent.getReadinessMessage()).toBe('ModelConfig "missing" not found');
    });

    it('is notAccepted when every admitting harness rejects the spec', () => {
      const agent = makeAgent({
        status: {
          observedGeneration: 1,
          harnesses: [
            harness('kagent', [
              { type: 'Accepted', status: 'False', message: 'selector mismatch' },
            ]),
          ],
        },
      });
      expect(agent.getReadiness()).toBe('notAccepted');
      expect(agent.getReadinessMessage()).toBe('selector mismatch');
    });

    it('is pending when the status describes an older generation', () => {
      const agent = makeAgent({
        metadata: { name: 'my-agent', namespace: 'kagent', generation: 3 },
        status: { observedGeneration: 2, harnesses: [harness('kagent', READY)] },
      });
      expect(agent.getReadiness()).toBe('pending');
      expect(agent.isStale()).toBe(true);
    });

    it('does not claim staleness when observedGeneration is absent', () => {
      const agent = makeAgent({
        metadata: { name: 'my-agent', namespace: 'kagent', generation: 3 },
        status: { harnesses: [harness('kagent', READY)] },
      });
      expect(agent.isStale()).toBe(false);
      expect(agent.getReadiness()).toBe('ready');
    });

    it('joins harness warnings into the unsupported-features warning', () => {
      const agent = makeAgent({
        status: {
          observedGeneration: 1,
          harnesses: [
            harness('kagent', READY, { warnings: ['streaming disabled'] }),
            harness('claude', READY, { warnings: ['no approvals'] }),
          ],
        },
      });
      expect(agent.getUnsupportedFeaturesWarning()).toBe(
        'kagent: streaming disabled\nclaude: no approvals',
      );
      expect(makeAgent().getUnsupportedFeaturesWarning()).toBeUndefined();
    });
  });

  describe('deriveAgentReadiness / isAgentTransitional', () => {
    it('agree with the instance method and treat everything but ready as transitional', () => {
      const json = makeAgent({
        status: { observedGeneration: 1, harnesses: [harness('kagent', READY)] },
      }).jsonData;
      expect(deriveAgentReadiness(json)).toBe('ready');
      expect(isAgentTransitional('ready')).toBe(false);
      expect(isAgentTransitional('notReady')).toBe(true);
      expect(isAgentTransitional('pending')).toBe(true);
    });
  });

  describe('getAgentStatusChangedAt', () => {
    it('takes the newest transition across all harnesses', () => {
      const json = makeAgent({
        status: {
          harnesses: [
            {
              harness: 'kagent',
              conditions: [
                { type: 'Accepted', status: 'True', lastTransitionTime: '2026-09-09T10:00:00Z' },
              ],
            },
            {
              harness: 'claude',
              conditions: [
                { type: 'Ready', status: 'True', lastTransitionTime: '2026-09-09T11:00:00Z' },
              ],
            },
          ],
        },
      }).jsonData;
      expect(getAgentStatusChangedAt(json)).toBe(Date.parse('2026-09-09T11:00:00Z'));
    });

    it('falls back to the creation timestamp, then undefined', () => {
      const created = makeAgent({
        metadata: {
          name: 'x',
          namespace: 'kagent',
          creationTimestamp: '2026-09-09T09:00:00Z',
        },
      }).jsonData;
      expect(getAgentStatusChangedAt(created)).toBe(Date.parse('2026-09-09T09:00:00Z'));
      expect(getAgentStatusChangedAt(makeAgent().jsonData)).toBeUndefined();
    });
  });
});
