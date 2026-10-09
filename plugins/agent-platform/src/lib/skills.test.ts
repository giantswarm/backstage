import { canonicalRepoUrl, canonicalSkillId } from './skills';

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
