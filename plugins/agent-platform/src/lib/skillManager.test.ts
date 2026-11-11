import {
  catalogFromSkillManager,
  skillManagerToolName,
  type SkillManagerListing,
} from './skillManager';

const commit = 'a'.repeat(40);

describe('skillManagerToolName', () => {
  it('is the muster-exposed name', () => {
    expect(skillManagerToolName('list_skills')).toBe(
      'x_skill-manager_list_skills',
    );
  });
});

describe('catalogFromSkillManager', () => {
  it('maps skills and plugins under their repository, at its commit', () => {
    const listing: SkillManagerListing = {
      repositories: [
        {
          repoUrl: 'https://github.com/giantswarm/claude-code',
          ref: 'main',
          commit,
          private: true,
          truncated: false,
          skills: [
            {
              name: 'fluxcd',
              description: 'Flux',
              path: 'plugins/gs-base/skills/fluxcd',
              tags: ['gitops'],
            },
          ],
          plugins: [
            {
              name: 'gs-base',
              path: 'plugins/gs-base',
              format: 'claude-code',
              skills: [],
            },
            {
              name: 'review',
              path: 'plugins/review',
              format: 'agent-plugins',
              skills: [{ name: 'go-review', description: 'Go' }],
            },
          ],
        },
      ],
    };

    const catalog = catalogFromSkillManager(listing);

    expect(catalog.skills).toEqual([
      {
        name: 'fluxcd',
        description: 'Flux',
        tags: ['gitops'],
        repoUrl: 'https://github.com/giantswarm/claude-code',
        path: 'plugins/gs-base/skills/fluxcd',
        ref: 'main',
        commit,
      },
    ]);
    expect(catalog.plugins).toEqual([
      {
        name: 'gs-base',
        repoUrl: 'https://github.com/giantswarm/claude-code',
        path: 'plugins/gs-base',
        ref: 'main',
        commit,
        format: 'claude-code',
        skills: [],
      },
      {
        name: 'review',
        repoUrl: 'https://github.com/giantswarm/claude-code',
        path: 'plugins/review',
        ref: 'main',
        commit,
        format: 'agent-plugins',
        skills: [{ name: 'go-review', description: 'Go' }],
      },
    ]);
    expect(catalog).toMatchObject({
      hasRepositories: true,
      failedRepositories: [],
      truncated: false,
    });
    expect([...catalog.privateRepositories]).toEqual([
      'https://github.com/giantswarm/claude-code',
    ]);
  });

  it('reports a repository withheld from the person as failed, with why', () => {
    const catalog = catalogFromSkillManager({
      repositories: [
        {
          repoUrl: 'https://github.com/giantswarm/agent-skills-internal',
          private: true,
          truncated: false,
          error:
            'skill repository not readable: connect GitHub in muster (core_auth_login server=skill-manager)',
          skills: [],
          plugins: [],
        },
      ],
    });
    expect(catalog.skills).toEqual([]);
    expect(catalog.failedRepositories).toEqual([
      'https://github.com/giantswarm/agent-skills-internal',
    ]);
    expect(
      catalog.failureMessages[
        'https://github.com/giantswarm/agent-skills-internal'
      ],
    ).toContain('connect GitHub');
  });

  it('keeps a stale listing and still names the failure', () => {
    const catalog = catalogFromSkillManager({
      repositories: [
        {
          repoUrl: 'https://github.com/acme/skills',
          ref: 'main',
          commit,
          truncated: true,
          stale: true,
          error: 'GitHub answered 502',
          skills: [{ name: 'a', description: '', path: 'a' }],
          plugins: [],
        },
      ],
    });
    expect(catalog.skills).toHaveLength(1);
    expect(catalog.failedRepositories).toEqual([
      'https://github.com/acme/skills',
    ]);
    expect(catalog.truncated).toBe(true);
  });

  it('offers only writable, readable, whole-repository sources as targets', () => {
    const repo = (repoUrl: string, extra: object = {}) => ({
      repoUrl,
      commit,
      truncated: false,
      skills: [],
      plugins: [],
      ...extra,
    });
    const catalog = catalogFromSkillManager({
      repositories: [
        repo('https://github.com/acme/team-skills'),
        repo('https://github.com/giantswarm/agent-platform', {
          readOnly: true,
        }),
        repo('https://github.com/acme/scoped', { path: 'skills' }),
        repo('https://github.com/acme/private', { error: 'cannot read it' }),
      ],
    });
    expect(catalog.proposalTargets).toEqual([
      'https://github.com/acme/team-skills',
    ]);
  });

  it('has no repositories when skill-manager has no sources', () => {
    expect(catalogFromSkillManager({ repositories: [] })).toMatchObject({
      hasRepositories: false,
      skills: [],
      plugins: [],
    });
  });
});
