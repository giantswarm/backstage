import {
  discoveredPlugins,
  parsePluginManifest,
  pluginRootsFromPaths,
} from './plugins';

describe('pluginRootsFromPaths', () => {
  it('finds Agent Plugins and Claude Code roots by their manifest', () => {
    expect(
      pluginRootsFromPaths([
        'README.md',
        'plugins/review/plugin.json',
        'plugins/review/skills/lint/SKILL.md',
        'plugins/commit-commands/.claude-plugin/plugin.json',
        'plugins/commit-commands/commands/commit.md',
      ]),
    ).toEqual([
      {
        path: 'plugins/commit-commands',
        format: 'claude',
        manifest: 'plugins/commit-commands/.claude-plugin/plugin.json',
      },
      {
        path: 'plugins/review',
        format: 'agent-plugins',
        manifest: 'plugins/review/plugin.json',
      },
    ]);
  });

  it('reads a root with both manifests as Agent Plugins, as kagent does', () => {
    expect(
      pluginRootsFromPaths(['.claude-plugin/plugin.json', 'plugin.json']),
    ).toEqual([{ path: '', format: 'agent-plugins', manifest: 'plugin.json' }]);
  });

  it('never takes the .claude-plugin directory for a root of its own', () => {
    expect(pluginRootsFromPaths(['x/.claude-plugin/plugin.json'])).toEqual([
      {
        path: 'x',
        format: 'claude',
        manifest: 'x/.claude-plugin/plugin.json',
      },
    ]);
  });

  it('finds nothing in a skills-only repository', () => {
    expect(pluginRootsFromPaths(['a/SKILL.md', 'b/c/SKILL.md'])).toEqual([]);
  });
});

describe('parsePluginManifest', () => {
  it('reads name and description', () => {
    expect(
      parsePluginManifest('{"name":"review","description":"Reviews."}'),
    ).toEqual({ name: 'review', description: 'Reviews.' });
  });

  it.each(['not json', '[]', 'null', '{"name": 3}'])(
    'answers no fields for %p',
    raw => {
      const parsed = parsePluginManifest(raw);
      expect(parsed.name).toBeUndefined();
      expect(parsed.description).toBeUndefined();
    },
  );
});

describe('discoveredPlugins', () => {
  const common = {
    repoUrl: 'https://github.com/acme/plugins',
    repoName: 'plugins',
    ref: 'main',
    commit: 'a'.repeat(40),
  };

  it('lists the skills directly under skills/ by directory name', () => {
    const [plugin] = discoveredPlugins({
      ...common,
      roots: [
        {
          path: 'review',
          format: 'agent-plugins',
          manifest: 'review/plugin.json',
        },
      ],
      manifests: new Map([
        ['review/plugin.json', '{"name":"Review kit","description":"D."}'],
      ]),
      skills: [
        { path: 'review/skills/lint', description: 'Lints.' },
        { path: 'review/skills/docs', description: '' },
        { path: 'review/skills/docs/nested', description: 'deeper' },
        { path: 'other/skills/x', description: '' },
      ],
    });
    const { repoName: _repoName, ...fields } = common;
    expect(plugin).toEqual({
      ...fields,
      name: 'Review kit',
      description: 'D.',
      path: 'review',
      format: 'agent-plugins',
      skills: [
        { name: 'docs', description: '' },
        { name: 'lint', description: 'Lints.' },
      ],
      manifestReadable: true,
    });
  });

  it('names a plugin whose manifest was not read after its directory', () => {
    const [atRoot, nested] = discoveredPlugins({
      ...common,
      roots: [
        { path: '', format: 'claude', manifest: '.claude-plugin/plugin.json' },
        {
          path: 'plugins/commit-commands',
          format: 'claude',
          manifest: 'plugins/commit-commands/.claude-plugin/plugin.json',
        },
      ],
      manifests: new Map(),
      skills: [{ path: 'skills/one', description: '' }],
    });
    expect(atRoot.name).toBe('plugins');
    expect(atRoot.skills).toEqual([{ name: 'one', description: '' }]);
    expect(atRoot.manifestReadable).toBe(false);
    expect(nested.name).toBe('commit-commands');
  });
});
