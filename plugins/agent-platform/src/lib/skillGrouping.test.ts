import { DiscoveredSkill } from './skills';
import { groupSkillsByRepo, skillSubgroup } from './skillGrouping';

function skill(overrides: Partial<DiscoveredSkill>): DiscoveredSkill {
  return {
    name: 'demo',
    description: '',
    repoUrl: 'https://github.com/giantswarm/agent-skills',
    path: 'demo',
    ref: 'main',
    ...overrides,
  };
}

describe('skillSubgroup', () => {
  it('returns undefined for a root-level skill (agent-skills convention)', () => {
    expect(skillSubgroup('demo')).toBeUndefined();
  });

  it('returns undefined for a skill directly at the repo root', () => {
    expect(skillSubgroup('')).toBeUndefined();
  });

  it('strips a trailing "skills" container to find the plugin folder (claude-code convention)', () => {
    expect(skillSubgroup('plugins/gs-base/skills/registries')).toBe('gs-base');
    expect(skillSubgroup('plugins/gs-godev/skills/go-doc')).toBe('gs-godev');
  });

  it('uses the immediate parent when there is no noise container', () => {
    expect(skillSubgroup('sre/incident')).toBe('sre');
  });

  it('returns undefined when only noise segments remain', () => {
    expect(skillSubgroup('skills/foo')).toBeUndefined();
  });
});

describe('groupSkillsByRepo', () => {
  it('groups agent-skills-style root skills as ungrouped, no subgroups', () => {
    const skills = [
      skill({ name: 'demo', path: 'demo' }),
      skill({ name: 'k8s-debugging', path: 'k8s-debugging' }),
    ];

    const groups = groupSkillsByRepo(skills);

    expect(groups).toHaveLength(1);
    expect(groups[0].repoSlug).toBe('giantswarm/agent-skills');
    expect(groups[0].subgroups).toEqual([]);
    expect(groups[0].ungrouped.map(s => s.name)).toEqual([
      'demo',
      'k8s-debugging',
    ]);
  });

  it('groups claude-code-style nested skills by plugin folder', () => {
    const skills = [
      skill({
        name: 'registries',
        repoUrl: 'https://github.com/giantswarm/claude-code',
        path: 'plugins/gs-base/skills/registries',
      }),
      skill({
        name: 'go-doc',
        repoUrl: 'https://github.com/giantswarm/claude-code',
        path: 'plugins/gs-godev/skills/go-doc',
      }),
      skill({
        name: 'go-conventions',
        repoUrl: 'https://github.com/giantswarm/claude-code',
        path: 'plugins/gs-godev/skills/go-conventions',
      }),
    ];

    const groups = groupSkillsByRepo(skills);

    expect(groups).toHaveLength(1);
    expect(groups[0].ungrouped).toEqual([]);
    expect(groups[0].subgroups).toEqual([
      { key: 'gs-base', skills: [skills[0]] },
      { key: 'gs-godev', skills: [skills[1], skills[2]] },
    ]);
  });

  it('keeps repos separate and preserves first-seen repo order', () => {
    const claudeCodeSkill = skill({
      name: 'registries',
      repoUrl: 'https://github.com/giantswarm/claude-code',
      path: 'plugins/gs-base/skills/registries',
    });
    const agentSkillsSkill = skill({
      name: 'demo',
      repoUrl: 'https://github.com/giantswarm/agent-skills',
      path: 'demo',
    });

    const groups = groupSkillsByRepo([claudeCodeSkill, agentSkillsSkill]);

    expect(groups.map(g => g.repoSlug)).toEqual([
      'giantswarm/claude-code',
      'giantswarm/agent-skills',
    ]);
  });

  it('sorts subgroups alphabetically by key', () => {
    const skills = [
      skill({
        name: 'z-skill',
        repoUrl: 'https://github.com/giantswarm/claude-code',
        path: 'plugins/zzz/skills/z-skill',
      }),
      skill({
        name: 'a-skill',
        repoUrl: 'https://github.com/giantswarm/claude-code',
        path: 'plugins/aaa/skills/a-skill',
      }),
    ];

    const groups = groupSkillsByRepo(skills);

    expect(groups[0].subgroups.map(g => g.key)).toEqual(['aaa', 'zzz']);
  });

  it('returns an empty array for an empty skill list', () => {
    expect(groupSkillsByRepo([])).toEqual([]);
  });
});
