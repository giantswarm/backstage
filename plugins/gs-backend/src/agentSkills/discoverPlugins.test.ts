import { pluginsOf } from './discoverPlugins';

const at = {
  repoUrl: 'https://github.com/acme/agents',
  ref: 'main',
  commit: 'a'.repeat(40),
  repoName: 'agents',
};

describe('pluginsOf', () => {
  it('finds both formats and the skills directly under a package', () => {
    const plugins = pluginsOf(
      [
        'README.md',
        'plugins/review/plugin.json',
        'plugins/review/skills/go-review/SKILL.md',
        'plugins/review/skills/go-review/references/style.md',
        'plugins/review/skills/helm-review/SKILL.md',
        'plugins/review/skills/helm-review/nested/deep/SKILL.md',
        'plugins/commits/.claude-plugin/plugin.json',
        'plugins/commits/commands/commit.md',
        'plugins/commits/skills/commit-style/SKILL.md',
      ],
      [
        { path: 'plugins/review/skills/go-review', description: 'Go' },
        { path: 'plugins/review/skills/helm-review', description: '' },
        {
          path: 'plugins/review/skills/helm-review/nested/deep',
          description: 'not a package skill',
        },
        { path: 'plugins/commits/skills/commit-style', description: 'C' },
      ],
      at,
    );

    const source = { repoUrl: at.repoUrl, ref: at.ref, commit: at.commit };
    expect(plugins).toEqual([
      {
        name: 'commits',
        ...source,
        path: 'plugins/commits',
        format: 'claude-code',
        skills: [],
      },
      {
        name: 'review',
        ...source,
        path: 'plugins/review',
        format: 'agent-plugins',
        skills: [
          { name: 'go-review', description: 'Go' },
          { name: 'helm-review', description: '' },
        ],
      },
    ]);
  });

  it('reads a package at the repository root under the repository name', () => {
    const plugins = pluginsOf(
      ['plugin.json', 'skills/triage/SKILL.md'],
      [{ path: 'skills/triage', description: 'Triage' }],
      at,
    );
    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({
      name: 'agents',
      path: '',
      format: 'agent-plugins',
      skills: [{ name: 'triage', description: 'Triage' }],
    });
  });

  it('reads a directory with both manifests as an Agent Plugins package', () => {
    const plugins = pluginsOf(
      ['p/.claude-plugin/plugin.json', 'p/plugin.json'],
      [],
      at,
    );
    expect(plugins.map(p => [p.path, p.format])).toEqual([
      ['p', 'agent-plugins'],
    ]);
  });

  it('finds nothing in a repository of plain skills', () => {
    expect(
      pluginsOf(
        ['skills/a/SKILL.md'],
        [{ path: 'skills/a', description: '' }],
        at,
      ),
    ).toEqual([]);
  });
});
