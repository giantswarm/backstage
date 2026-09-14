import type { NewAgentFormState } from '../components/NewAgentFormProvider';
import { agentSpecOf, skillEntryOf } from './agentSpec';
import type { DiscoveredSkill } from './skills';

const HEAD = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';

const skill: DiscoveredSkill = {
  name: 'Incident responder',
  description: 'Triage.',
  repoUrl: 'https://github.com/giantswarm/agent-skills',
  path: 'sre/incident',
  ref: 'main',
  commit: HEAD,
};

const state: NewAgentFormState = {
  name: 'Go service reviewer',
  slug: 'go-service-reviewer',
  description: 'Reviews pull requests.',
  installation: 'gazelle',
  modelConfigName: 'opus-4-7',
  modelConfigNamespace: 'kagent',
  systemMessage: 'You review pull requests.',
  selectedSkills: [skill],
  toolset: ['preset:read-only'],
};

describe('skillEntryOf', () => {
  it('pins the commit the skills step showed, never the branch', () => {
    expect(skillEntryOf(skill)).toEqual({
      name: 'Incident responder',
      path: 'sre/incident',
      git: { url: 'https://github.com/giantswarm/agent-skills', commit: HEAD },
    });
    expect(JSON.stringify(skillEntryOf(skill))).not.toContain('main');
  });

  it('omits the path for a repo-root skill', () => {
    expect(skillEntryOf({ ...skill, path: '' })).not.toHaveProperty('path');
  });
});

describe('agentSpecOf', () => {
  it("is agent-manager's create contract: the slug as the name, the ModelConfig's namespace, the declared toolset", () => {
    expect(
      agentSpecOf(state, {
        toolset: ['preset:read-only'],
        iconUrl: 'https://avatars.gazelle.example/v1/go-service-reviewer.png',
      }),
    ).toEqual({
      namespace: 'kagent',
      name: 'go-service-reviewer',
      displayName: 'Go service reviewer',
      description: 'Reviews pull requests.',
      systemMessage: 'You review pull requests.',
      modelConfig: 'opus-4-7',
      iconUrl: 'https://avatars.gazelle.example/v1/go-service-reviewer.png',
      skills: [skillEntryOf(skill)],
      toolset: ['preset:read-only'],
    });
  });

  it('leaves optional fields out so the chart defaults apply', () => {
    const spec = agentSpecOf(
      {
        ...state,
        description: '  ',
        systemMessage: '',
        selectedSkills: [],
      },
      { toolset: ['preset:none'] },
    );
    expect(spec).not.toHaveProperty('description');
    expect(spec).not.toHaveProperty('systemMessage');
    expect(spec).not.toHaveProperty('iconUrl');
    expect(spec).not.toHaveProperty('skills');
    expect(spec.toolset).toEqual(['preset:none']);
  });

  it('carries no runtime and no credential', () => {
    const spec = agentSpecOf(state, { toolset: ['preset:read-only'] });
    expect(spec).not.toHaveProperty('runtime');
    expect(JSON.stringify(spec)).not.toMatch(/gitAuth/);
  });
});
