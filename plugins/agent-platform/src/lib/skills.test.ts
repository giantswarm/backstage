import {
  canonicalRepoUrl,
  canonicalSkillId,
  normalizedRepoUrl,
  parseSkillDetailPath,
  skillCommitUrl,
  skillDetailPath,
  skillSourceUrl,
} from './skills';

describe('canonicalRepoUrl', () => {
  it.each([
    [
      'https://github.com/giantswarm/skills',
      'https://github.com/giantswarm/skills',
    ],
    [
      'https://github.com/giantswarm/skills.git',
      'https://github.com/giantswarm/skills',
    ],
    [
      'https://github.com/giantswarm/skills/',
      'https://github.com/giantswarm/skills',
    ],
    [
      'https://GitHub.com/GiantSwarm/Skills',
      'https://github.com/giantswarm/skills',
    ],
    [
      'http://github.com/giantswarm/skills',
      'https://github.com/giantswarm/skills',
    ],
    [
      'git@github.com:giantswarm/skills.git',
      'https://github.com/giantswarm/skills',
    ],
    [
      'ssh://git@github.com/giantswarm/skills.git',
      'https://github.com/giantswarm/skills',
    ],
    [
      'git+https://github.com/giantswarm/skills',
      'https://github.com/giantswarm/skills',
    ],
    [
      'https://token@github.com/giantswarm/skills',
      'https://github.com/giantswarm/skills',
    ],
    [
      'https://Git.Example.com/Team/Skills.git',
      'https://git.example.com/Team/Skills',
    ],
  ])('reads %s as %s', (input, expected) => {
    expect(canonicalRepoUrl(input)).toBe(expected);
  });
});

describe('canonicalSkillId', () => {
  it('names one skill the same however its repository and path are written', () => {
    const expected = 'https://github.com/giantswarm/skills#skills/triage';
    expect(
      canonicalSkillId({
        repoUrl: 'https://github.com/giantswarm/skills',
        path: 'skills/triage',
      }),
    ).toBe(expected);
    expect(
      canonicalSkillId({
        repoUrl: 'git@github.com:giantswarm/skills.git',
        path: './skills/triage/',
      }),
    ).toBe(expected);
  });

  it('keeps a skill at the repository root', () => {
    expect(
      canonicalSkillId({
        repoUrl: 'https://github.com/giantswarm/skills.git',
        path: '',
      }),
    ).toBe('https://github.com/giantswarm/skills#');
  });
});

describe('normalizedRepoUrl', () => {
  it('keeps the case a repository is written in', () => {
    expect(normalizedRepoUrl('git@GitHub.com:GiantSwarm/Skills.git')).toBe(
      'https://github.com/GiantSwarm/Skills',
    );
  });
});

describe('skillDetailPath / parseSkillDetailPath', () => {
  it('round-trips a nested skill directory', () => {
    const skill = {
      repoUrl: 'https://github.com/giantswarm/skills',
      path: 'collections/support/ticket-triage',
    };
    const path = skillDetailPath(skill);
    expect(path).toBe('giantswarm/skills/collections/support/ticket-triage');
    expect(parseSkillDetailPath(path!)).toEqual({
      repoUrl: 'https://github.com/giantswarm/skills',
      path: 'collections/support/ticket-triage',
    });
  });

  it('round-trips a skill at the repository root', () => {
    const skill = { repoUrl: 'git@github.com:giantswarm/skills.git', path: '' };
    const path = skillDetailPath(skill);
    expect(path).toBe('giantswarm/skills');
    expect(parseSkillDetailPath(path!)).toEqual({
      repoUrl: 'https://github.com/giantswarm/skills',
      path: '',
    });
  });

  it('has no detail path outside github.com, and refuses a bare owner', () => {
    expect(
      skillDetailPath({ repoUrl: 'https://gitlab.com/g/skills', path: 'x' }),
    ).toBeUndefined();
    expect(parseSkillDetailPath('giantswarm')).toBeUndefined();
  });
});

describe('skillSourceUrl / skillCommitUrl', () => {
  const skill = {
    repoUrl: 'https://github.com/giantswarm/skills',
    path: 'ticket-triage',
    commit: 'a1b2c3d4e5',
  };

  it('points at the skill directory at the pinned commit', () => {
    expect(skillSourceUrl(skill)).toBe(
      'https://github.com/giantswarm/skills/tree/a1b2c3d4e5/ticket-triage',
    );
    expect(skillSourceUrl({ ...skill, path: '' })).toBe(
      'https://github.com/giantswarm/skills/tree/a1b2c3d4e5',
    );
  });

  it('points at the pinned commit itself', () => {
    expect(skillCommitUrl(skill)).toBe(
      'https://github.com/giantswarm/skills/commit/a1b2c3d4e5',
    );
  });
});
