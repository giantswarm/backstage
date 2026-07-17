import { crds } from '@giantswarm/k8s-types';
import { Agent } from './Agent';

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
});
