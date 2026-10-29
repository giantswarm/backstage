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
  modelDisplayName: 'Opus 4.7',
  harness: undefined,
  droppedHarness: undefined,
  systemMessage: 'You review pull requests.',
  egressText: '',
  egressPolicyRefs: [],
  defaultWorkspace: '',
  selectedSkills: [skill],
  keptSkills: [],
  selectedPlugins: [],
  keptPlugins: [],
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
  it('sends the default workspace in the agent namespace, and none when unset', () => {
    expect(
      agentSpecOf(
        { ...state, defaultWorkspace: 'platform' },
        { toolset: ['preset:read-only'] },
      ).defaultWorkspace,
    ).toBe(`${state.modelConfigNamespace}/platform`);
    expect(
      agentSpecOf(state, { toolset: ['preset:read-only'] }),
    ).not.toHaveProperty('defaultWorkspace');
  });

  it('sends the extra egress origins as typed, one per line, and none when empty', () => {
    expect(
      agentSpecOf(
        {
          ...state,
          egressText:
            ' https://github.com:443 \n\nhttps://*.githubusercontent.com\n',
        },
        { toolset: ['preset:read-only'] },
      ).egress,
    ).toEqual(['https://github.com:443', 'https://*.githubusercontent.com']);
    expect(
      agentSpecOf(state, { toolset: ['preset:read-only'] }),
    ).not.toHaveProperty('egress');
  });

  it('sends the picked EgressPolicies by name, and none when nothing is picked', () => {
    expect(
      agentSpecOf(
        { ...state, egressPolicyRefs: ['github', 'go-modules'] },
        { toolset: ['preset:read-only'] },
      ).egressPolicyRefs,
    ).toEqual(['github', 'go-modules']);
    expect(
      agentSpecOf(state, { toolset: ['preset:read-only'] }),
    ).not.toHaveProperty('egressPolicyRefs');
  });

  it('sends the picked plugins pinned, with their selections, and none when empty', () => {
    const plugin = {
      name: 'review',
      repoUrl: 'https://github.com/giantswarm/agent-skills',
      path: 'plugins/review',
      ref: 'main',
      commit: HEAD,
      format: 'agent-plugins' as const,
      skills: [{ name: 'go-review', description: '' }],
    };
    expect(
      agentSpecOf(
        {
          ...state,
          selectedPlugins: [
            { plugin, skills: ['go-review'] },
            {
              plugin: {
                ...plugin,
                path: 'plugins/commits',
                format: 'claude-code',
                skills: [],
              },
              skills: [],
            },
          ],
        },
        { toolset: [] },
      ).plugins,
    ).toEqual([
      {
        path: 'plugins/review',
        git: { url: plugin.repoUrl, commit: HEAD },
        skills: ['go-review'],
      },
      { path: 'plugins/commits', git: { url: plugin.repoUrl, commit: HEAD } },
    ]);
    expect(agentSpecOf(state, { toolset: [] })).not.toHaveProperty('plugins');
  });

  it('names the Harness picked, and none for the platform Harness', () => {
    expect(
      agentSpecOf(
        {
          ...state,
          harness: { name: 'claude-go', runtime: 'claude' },
        },
        { toolset: [] },
      ).harness,
    ).toBe('claude-go');
    expect(agentSpecOf(state, { toolset: [] })).not.toHaveProperty('harness');
  });

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
