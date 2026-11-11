import {
  allSkillNamesOf,
  DiscoveredPlugin,
  pluginEntryName,
  pluginEntryOf,
  pluginEntryPlace,
  pluginId,
  pluginSelectionOf,
  pluginSkillsOf,
  pluginSummary,
  repeatedSkillNames,
  searchPlugins,
} from './plugins';

const HEAD = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';

const review: DiscoveredPlugin = {
  name: 'review',
  repoUrl: 'https://github.com/giantswarm/agent-skills',
  path: 'plugins/review',
  ref: 'main',
  commit: HEAD,
  format: 'agent-plugins',
  skills: [
    { name: 'go-review', description: '' },
    { name: 'helm-review', description: '' },
  ],
};

describe('pluginEntryOf', () => {
  it('pins the plugin to the commit shown and carries the selection', () => {
    expect(pluginEntryOf({ plugin: review, skills: ['go-review'] })).toEqual({
      path: 'plugins/review',
      git: { url: review.repoUrl, commit: HEAD },
      skills: ['go-review'],
    });
  });

  it('leaves out the selection and the path when there are none', () => {
    expect(
      pluginEntryOf({
        plugin: { ...review, path: '', format: 'claude-code', skills: [] },
        skills: [],
      }),
    ).toEqual({ git: { url: review.repoUrl, commit: HEAD } });
  });
});

describe('pluginEntryPlace', () => {
  it('matches the catalog plugin whatever shape the URL was written in', () => {
    expect(
      pluginEntryPlace({
        path: 'plugins/review/',
        git: { url: 'https://github.com/GiantSwarm/agent-skills.git' },
      }),
    ).toBe(pluginId(review));
  });

  it('has no place for an OCI plugin', () => {
    expect(pluginEntryPlace({ oci: 'oci://x/y@sha256:abc' })).toBeUndefined();
  });
});

describe('pluginEntryName and pluginSummary', () => {
  it('names a plugin by its directory, else its repository', () => {
    expect(pluginEntryName({ path: 'plugins/review' })).toBe('review');
    expect(
      pluginEntryName({ git: { url: 'https://github.com/acme/tools.git' } }),
    ).toBe('tools');
  });

  it('says what of a plugin loads', () => {
    expect(pluginSummary({ path: 'p/review', skills: ['a', 'b'] })).toBe(
      'review (a, b)',
    );
    expect(pluginSummary({ path: 'p/commits' })).toBe('commits (whole plugin)');
  });
});

describe('repeatedSkillNames', () => {
  it('names each skill name used twice across skills and plugins', () => {
    expect(
      repeatedSkillNames(
        ['go-review', 'triage'],
        [{ skills: ['go-review'] }, { skills: ['triage', 'x'] }, {}],
      ),
    ).toEqual(['go-review', 'triage']);
    expect(repeatedSkillNames(['a'], [{ skills: ['b'] }])).toEqual([]);
  });
});

const commits: DiscoveredPlugin = {
  name: 'commits',
  repoUrl: 'https://github.com/giantswarm/claude-code',
  path: 'plugins/commits',
  ref: 'main',
  commit: HEAD,
  format: 'claude-code',
  skills: [],
};

describe('pluginSkillsOf', () => {
  const catalog = [
    {
      repoUrl: 'https://github.com/giantswarm/claude-code.git',
      path: 'plugins/commits/skills/style',
      description: 'Commit style.',
    },
    {
      repoUrl: 'https://github.com/giantswarm/claude-code',
      path: 'plugins/commits/skills/amend',
      description: '',
    },
    // Nested below a skill, in another plugin, or in another repository: not
    // one of its skills.
    {
      repoUrl: 'https://github.com/giantswarm/claude-code',
      path: 'plugins/commits/skills/style/nested',
      description: 'no',
    },
    {
      repoUrl: 'https://github.com/giantswarm/claude-code',
      path: 'plugins/other/skills/x',
      description: 'no',
    },
    {
      repoUrl: 'https://github.com/giantswarm/agent-skills',
      path: 'plugins/commits/skills/y',
      description: 'no',
    },
  ];

  it("reads a Claude Code plugin's skills from the catalogue", () => {
    expect(pluginSkillsOf(commits, catalog)).toEqual([
      { name: 'amend', description: '' },
      { name: 'style', description: 'Commit style.' },
    ]);
  });

  it("keeps an Agent Plugins package's listed skills", () => {
    expect(pluginSkillsOf(review, catalog)).toBe(review.skills);
  });
});

describe('allSkillNamesOf', () => {
  it('names every skill of a package and none of a Claude Code plugin', () => {
    expect(allSkillNamesOf(review)).toEqual(['go-review', 'helm-review']);
    expect(
      allSkillNamesOf({
        ...commits,
        skills: [{ name: 'x', description: '' }],
      }),
    ).toEqual([]);
  });
});

describe('pluginSelectionOf', () => {
  it('tells none, some, all and a whole entry apart', () => {
    expect(pluginSelectionOf(review, undefined)).toBe('none');
    expect(
      pluginSelectionOf(review, { plugin: review, skills: ['go-review'] }),
    ).toBe('some');
    expect(
      pluginSelectionOf(review, {
        plugin: review,
        skills: ['helm-review', 'go-review'],
      }),
    ).toBe('all');
    expect(pluginSelectionOf(review, { plugin: review, skills: [] })).toBe(
      'whole',
    );
  });

  it('reads a selection naming a skill no longer listed as some', () => {
    expect(
      pluginSelectionOf(
        { ...review, skills: [{ name: 'go-review', description: '' }] },
        { plugin: review, skills: ['gone'] },
      ),
    ).toBe('some');
  });
});

describe('searchPlugins', () => {
  const rows = [
    {
      plugin: review,
      skills: [
        { name: 'go-review', description: 'Reviews Go code.' },
        { name: 'helm-review', description: 'Reviews charts.' },
      ],
    },
    { plugin: commits, skills: [{ name: 'style', description: 'Commits.' }] },
  ];

  it('keeps everything and opens nothing without a query', () => {
    expect(searchPlugins(rows, '  ')).toEqual(
      rows.map(row => ({ ...row, hasSkillMatch: false })),
    );
  });

  it('keeps the matching skills of a plugin found by its skills', () => {
    expect(searchPlugins(rows, 'chart')).toEqual([
      {
        plugin: review,
        skills: [{ name: 'helm-review', description: 'Reviews charts.' }],
        hasSkillMatch: true,
      },
    ]);
  });

  it('keeps every skill of a plugin found by its name', () => {
    expect(searchPlugins(rows, 'commits')).toEqual([
      { ...rows[1], hasSkillMatch: true },
    ]);
    expect(searchPlugins(rows, 'review')).toEqual([
      { ...rows[0], hasSkillMatch: true },
    ]);
    expect(searchPlugins(rows, 'agent-skills')).toEqual([
      { ...rows[0], hasSkillMatch: false },
    ]);
  });
});
