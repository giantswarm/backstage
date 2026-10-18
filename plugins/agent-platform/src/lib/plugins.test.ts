import {
  pluginEntryKey,
  pluginEntryOf,
  pluginLabel,
  pluginPlace,
  pluginSummary,
  skillNameClashes,
  type DiscoveredPlugin,
} from './plugins';

const HEAD = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';

const KIT: DiscoveredPlugin = {
  name: 'review-kit',
  description: '',
  repoUrl: 'https://github.com/Acme/Plugins',
  path: 'kit',
  ref: 'main',
  commit: HEAD,
  format: 'agent-plugins',
  skills: [{ name: 'lint', description: '' }],
};

describe('pluginEntryOf', () => {
  it('pins an Agent Plugins package to the commit shown, with its selection', () => {
    expect(pluginEntryOf(KIT, ['lint'])).toEqual({
      path: 'kit',
      git: { url: 'https://github.com/Acme/Plugins', commit: HEAD },
      skills: ['lint'],
    });
  });

  it('gives a Claude Code plugin and an empty selection no skills key', () => {
    expect(pluginEntryOf({ ...KIT, format: 'claude' }, ['lint'])).toEqual({
      path: 'kit',
      git: { url: 'https://github.com/Acme/Plugins', commit: HEAD },
    });
    expect(pluginEntryOf(KIT)).not.toHaveProperty('skills');
  });

  it('omits the path of a plugin at the repository root', () => {
    expect(pluginEntryOf({ ...KIT, path: '' })).not.toHaveProperty('path');
  });
});

describe('pluginPlace', () => {
  it('is the same for a discovered plugin and an entry of it, whatever the pin', () => {
    expect(
      pluginPlace({
        path: './kit/',
        git: { url: 'https://github.com/acme/plugins.git', commit: 'x' },
      }),
    ).toBe(pluginPlace(KIT));
  });

  it('places an OCI plugin by its repository', () => {
    expect(pluginPlace({ oci: 'gsoci.azurecr.io/p/kit@sha256:abc' })).toBe(
      pluginPlace({ oci: 'gsoci.azurecr.io/p/kit:1.0.0' }),
    );
  });
});

describe('pluginEntryKey', () => {
  it('tells a moved pin and a changed selection apart', () => {
    const entry = pluginEntryOf(KIT, ['lint']);
    expect(pluginEntryKey(entry)).not.toBe(
      pluginEntryKey({ ...entry, skills: [] }),
    );
    expect(pluginEntryKey(entry)).not.toBe(
      pluginEntryKey({
        ...entry,
        git: { url: KIT.repoUrl, commit: 'b'.repeat(40) },
      }),
    );
  });
});

describe('pluginLabel and pluginSummary', () => {
  it('names a plugin by its directory, else its repository', () => {
    expect(pluginLabel({ path: 'plugins/commit-commands' })).toBe(
      'commit-commands',
    );
    expect(
      pluginLabel({
        git: { url: 'https://github.com/acme/kit.git', commit: HEAD },
      }),
    ).toBe('kit');
    expect(pluginLabel({ oci: 'gsoci.azurecr.io/p/kit@sha256:abc' })).toBe(
      'kit',
    );
  });

  it('lists the skills an entry enables', () => {
    expect(pluginSummary(pluginEntryOf(KIT, ['lint']))).toBe('kit (lint)');
    expect(pluginSummary(pluginEntryOf(KIT))).toBe('kit');
  });
});

describe('skillNameClashes', () => {
  it('finds a name enabled by a skill and a plugin, or by two plugins', () => {
    const skill = {
      name: 'lint',
      git: { url: 'https://github.com/acme/skills', commit: HEAD },
    };
    expect(skillNameClashes([skill], [pluginEntryOf(KIT, ['lint'])])).toEqual([
      'Plugin kit enables the skill lint, which the skill lint already provides. Keep one of them.',
    ]);
    expect(
      skillNameClashes(
        [],
        [
          pluginEntryOf(KIT, ['lint']),
          pluginEntryOf({ ...KIT, path: 'other' }, ['lint']),
        ],
      ),
    ).toEqual([
      'Plugin other enables the skill lint, which plugin kit already provides. Keep one of them.',
    ]);
    expect(skillNameClashes([skill], [pluginEntryOf(KIT)])).toEqual([]);
  });
});
