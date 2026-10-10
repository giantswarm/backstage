import {
  canonicalRepoUrl,
  canonicalSkillId,
  canProposeSkillTo,
  normalizedRepoUrl,
  parseSkillDetailPath,
  resolveSkillDetailPath,
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

  it('addresses a skill outside github.com under `-`, which no GitHub owner can be', () => {
    const skill = {
      repoUrl: 'https://gitlab.example.com/group/sub/skills.git',
      path: 'support/ticket-triage',
    };
    const path = skillDetailPath(skill);
    expect(path).toBe(
      '-/gitlab.example.com/group/sub/skills/-/support/ticket-triage',
    );
    const parsed = parseSkillDetailPath(path!);
    expect(parsed).toEqual({
      repoUrl: 'https://gitlab.example.com/group/sub/skills',
      path: 'support/ticket-triage',
    });
    expect(canonicalSkillId(parsed!)).toBe(canonicalSkillId(skill));
  });

  it('round-trips a plain-http lab repository at its root, port included', () => {
    const skill = {
      repoUrl: 'http://gitserver.agent-platform.svc:8080/skills.git',
      path: '',
    };
    const path = skillDetailPath(skill);
    expect(path).toBe('-/gitserver.agent-platform.svc%3A8080/skills');
    const parsed = parseSkillDetailPath(path!);
    expect(parsed).toEqual({
      repoUrl: 'https://gitserver.agent-platform.svc:8080/skills',
      path: '',
    });
    // Same skill whatever the scheme it was configured with.
    expect(canonicalSkillId(parsed!)).toBe(canonicalSkillId(skill));
  });

  it('refuses a bare owner, a bare host and a non-http(s) URL', () => {
    expect(parseSkillDetailPath('giantswarm')).toBeUndefined();
    expect(parseSkillDetailPath('-/gitea.lab.local')).toBeUndefined();
    expect(
      skillDetailPath({ repoUrl: 'file:///srv/skills', path: 'x' }),
    ).toBeUndefined();
  });
});

describe('resolveSkillDetailPath', () => {
  const triage = {
    repoUrl: 'https://github.com/giantswarm/skills',
    path: 'ticket-triage',
  };
  const lab = { repoUrl: 'http://gitea.lab.local/lab/skills', path: '' };
  const shadow = {
    repoUrl: 'https://github.com/giantswarm/skills',
    path: 'ticket-triage/used-by',
  };

  it('reads the skill itself as its Overview', () => {
    expect(
      resolveSkillDetailPath('giantswarm/skills/ticket-triage', [triage]),
    ).toMatchObject({ skill: triage, tab: 'overview' });
  });

  it('reads a trailing tab segment as the tab of the skill before it', () => {
    expect(
      resolveSkillDetailPath('giantswarm/skills/ticket-triage/instructions', [
        triage,
      ]),
    ).toMatchObject({ skill: triage, tab: 'instructions' });
    expect(
      resolveSkillDetailPath('-/gitea.lab.local/lab/skills/used-by', [lab]),
    ).toMatchObject({ skill: lab, tab: 'used-by' });
  });

  it('prefers a skill whose directory is named like a tab', () => {
    expect(
      resolveSkillDetailPath('giantswarm/skills/ticket-triage/used-by', [
        triage,
        shadow,
      ]),
    ).toMatchObject({ skill: shadow, tab: 'overview' });
  });

  it('names the address it could not find, and nothing without a repository', () => {
    expect(
      resolveSkillDetailPath('giantswarm/skills/gone/instructions', [triage]),
    ).toEqual({
      target: {
        repoUrl: 'https://github.com/giantswarm/skills',
        path: 'gone/instructions',
      },
      skill: undefined,
      tab: 'overview',
    });
    expect(resolveSkillDetailPath('giantswarm', [triage])).toBeUndefined();
  });
});

describe('canProposeSkillTo', () => {
  it('accepts exactly what the pull-request endpoint accepts', () => {
    expect(canProposeSkillTo('https://github.com/giantswarm/skills')).toBe(
      true,
    );
    expect(canProposeSkillTo('https://gitlab.com/g/skills')).toBe(false);
    expect(canProposeSkillTo('http://gitea.lab.local/lab/skills')).toBe(false);
    expect(canProposeSkillTo('git@github.com:giantswarm/skills.git')).toBe(
      false,
    );
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
