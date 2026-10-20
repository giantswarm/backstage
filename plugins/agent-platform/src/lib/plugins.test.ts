import {
  DiscoveredPlugin,
  pluginEntryName,
  pluginEntryOf,
  pluginEntryPlace,
  pluginId,
  pluginSummary,
  repeatedSkillNames,
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
