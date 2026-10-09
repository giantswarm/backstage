import type { AgentRow } from '../components/AgentsDataProvider';
import type { ModelRow } from '../components/ModelsTable';
import {
  agentParts,
  agentsByModel,
  agentsBySkill,
  agentStatus,
  ALL_ORGANIZATIONS,
  connectorCount,
  inOrganization,
  modelStatus,
  organizationsOf,
  rankSkills,
  searchAgents,
  searchModels,
  searchSkills,
  usedByLabel,
} from './customize';
import type { DiscoveredSkill } from './skills';

function agent(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: 'golem/support/triage',
    installation: 'golem',
    namespace: 'support',
    name: 'Support triage',
    technicalName: 'triage',
    description: 'Sorts tickets',
    skillCount: 0,
    readiness: 'ready',
    ...overrides,
  };
}

function model(overrides: Partial<ModelRow> = {}): ModelRow {
  return {
    id: 'golem/support/sonnet',
    installation: 'golem',
    name: 'sonnet',
    namespace: 'support',
    displayName: 'Sonnet 4.5',
    provider: 'Anthropic',
    model: 'claude-sonnet-4-5',
    endpoint: '',
    readiness: 'accepted',
    ...overrides,
  };
}

function skill(name: string, path = name): DiscoveredSkill {
  return {
    name,
    description: `About ${name}`,
    repoUrl: 'https://github.com/giantswarm/skills',
    path,
    ref: 'main',
    commit: 'abc',
  };
}

describe('agentStatus', () => {
  it('uses the readiness label and its tone', () => {
    expect(agentStatus(agent())).toEqual({ label: 'Ready', tone: 'success' });
    expect(agentStatus(agent({ readiness: 'failed' }))).toEqual({
      label: 'Failed',
      tone: 'danger',
    });
  });

  it('says when nothing answers for the model', () => {
    expect(
      agentStatus(
        agent({
          modelServing: {
            installation: 'golem',
            backend: 'ollama',
            readiness: 'notServing',
            name: 'qwen',
            message: 'gone',
          },
        }),
      ),
    ).toEqual({ label: 'Model not running', tone: 'warning' });
  });
});

describe('connectorCount', () => {
  it('counts the servers a composed toolset names', () => {
    expect(
      connectorCount(
        agent({
          toolset: {
            state: 'declared',
            carrier: 'triage',
            selectors: ['server:github', 'server:jira', 'server:github'],
          },
        }),
      ),
    ).toBe(2);
  });

  it('counts none for an agent without tools', () => {
    expect(connectorCount(agent({ toolset: { state: 'no-gateway' } }))).toBe(0);
    expect(
      connectorCount(
        agent({
          toolset: {
            state: 'declared',
            carrier: 'triage',
            selectors: ['preset:none'],
          },
        }),
      ),
    ).toBe(0);
  });

  it('does not count what only muster resolves', () => {
    expect(connectorCount(agent())).toBeUndefined();
    expect(
      connectorCount(
        agent({ toolset: { state: 'implicit-full', carrier: 'triage' } }),
      ),
    ).toBeUndefined();
    expect(
      connectorCount(
        agent({
          toolset: {
            state: 'declared',
            carrier: 'triage',
            selectors: ['server:github', 'preset:read-only'],
          },
        }),
      ),
    ).toBeUndefined();
  });
});

describe('agentParts', () => {
  it('names skills and, when known, connectors', () => {
    expect(agentParts(agent({ skillCount: 1 }))).toBe('1 skill');
    expect(
      agentParts(
        agent({
          skillCount: 2,
          toolset: {
            state: 'declared',
            carrier: 'triage',
            selectors: ['server:github'],
          },
        }),
      ),
    ).toBe('2 skills · 1 connector');
  });
});

describe('modelStatus', () => {
  it('reads the ModelConfig verdict first', () => {
    expect(modelStatus(model({ readiness: 'notAccepted' }))).toEqual({
      label: 'Not accepted',
      tone: 'danger',
    });
    expect(modelStatus(model({ readiness: 'pending' }))).toEqual({
      label: 'Pending',
      tone: 'neutral',
    });
  });

  it('is available unless the serving layer says otherwise', () => {
    expect(modelStatus(model())).toEqual({
      label: 'Available',
      tone: 'success',
    });
    const servedBy = {
      installation: 'golem',
      backend: 'kserve' as const,
      name: 'qwen',
      message: '',
    };
    expect(
      modelStatus(
        model({ servedBy: { ...servedBy, readiness: 'notServing' } }),
      ),
    ).toEqual({ label: 'Not running', tone: 'warning' });
    expect(
      modelStatus(model({ servedBy: { ...servedBy, readiness: 'idle' } })),
    ).toEqual({ label: 'Available', tone: 'success' });
    expect(
      modelStatus(model({ servedBy: { ...servedBy, readiness: 'starting' } }))
        .label,
    ).toBe('Starting');
  });
});

describe('usage', () => {
  const agents = [
    agent({
      id: 'a',
      modelConfigId: 'golem/support/sonnet',
      skillIds: [
        'https://github.com/giantswarm/skills#triage',
        'https://github.com/giantswarm/skills#triage',
      ],
    }),
    agent({
      id: 'b',
      modelConfigId: 'golem/support/sonnet',
      skillIds: ['https://github.com/giantswarm/skills#notes'],
    }),
    agent({ id: 'c' }),
  ];

  it('counts the agents per model', () => {
    expect(agentsByModel(agents).get('golem/support/sonnet')).toBe(2);
  });

  it('counts an agent once per skill', () => {
    const usage = agentsBySkill(agents);
    expect(usage.get('https://github.com/giantswarm/skills#triage')).toBe(1);
    expect(usage.get('https://github.com/giantswarm/skills#notes')).toBe(1);
  });

  it('ranks the most used skills first, then by name', () => {
    const usage = new Map([['https://github.com/giantswarm/skills#notes', 3]]);
    expect(
      rankSkills([skill('zeta'), skill('alpha'), skill('notes')], usage).map(
        s => s.name,
      ),
    ).toEqual(['notes', 'alpha', 'zeta']);
  });

  it('words the usage', () => {
    expect(usedByLabel(0)).toBe('Not used yet');
    expect(usedByLabel(1)).toBe('Used by 1 agent');
    expect(usedByLabel(3)).toBe('Used by 3 agents');
  });
});

describe('search and organizations', () => {
  it('searches what a reader looks things up by', () => {
    expect(searchAgents([agent()], 'TICKETS')).toHaveLength(1);
    expect(searchAgents([agent()], 'nothing')).toHaveLength(0);
    expect(searchModels([model()], 'anthropic')).toHaveLength(1);
    expect(searchSkills([skill('triage')], 'giantswarm/skills')).toHaveLength(
      1,
    );
  });

  it('lists the organizations once, sorted', () => {
    expect(
      organizationsOf([
        { namespace: 'support' },
        { namespace: 'engineering' },
        { namespace: 'support' },
      ]),
    ).toEqual(['engineering', 'support']);
  });

  it('narrows to one organization, or keeps all', () => {
    const rows = [agent(), agent({ id: 'x', namespace: 'engineering' })];
    expect(inOrganization(rows, ALL_ORGANIZATIONS)).toHaveLength(2);
    expect(inOrganization(rows, 'engineering').map(r => r.id)).toEqual(['x']);
  });
});
