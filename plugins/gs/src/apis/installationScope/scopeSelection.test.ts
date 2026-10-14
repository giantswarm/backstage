import type { InstallationInventoryEntry } from '../installationInventory/types';
import { ALL_INSTALLATIONS } from './installationScopeStore';
import {
  applyInstallationScope,
  describeInstallationScopeOption,
  installationsSwitchedOffWithComponent,
  installationsWithComponent,
  installationsWithoutComponent,
  isPlatformInstallation,
  selectPlatformInstallations,
} from './scopeSelection';

function entry(
  installation: string,
  overrides: Partial<InstallationInventoryEntry> = {},
): InstallationInventoryEntry {
  return {
    installation,
    home: false,
    accessState: 'healthy',
    muted: false,
    probe: 'answered',
    components: { kagent: false, muster: false, kserve: false, capi: true },
    ...overrides,
  };
}

const golem = entry('golem', {
  home: true,
  components: { kagent: true, muster: true, kserve: false, capi: true },
});
const wombat = entry('wombat', {
  components: { kagent: false, muster: true, kserve: false, capi: true },
});
const snail = entry('snail'); // CAPI only: a plain management cluster
const pending = entry('slug', {
  probe: 'pending',
  accessState: 'connecting',
});
// Switched off in the sidebar Cluster access widget. Its cached answer outlives
// the switch, so it still looks like a full-blown platform installation.
const switchedOff = entry('yak', {
  muted: true,
  accessState: 'unknown',
  components: { kagent: true, muster: true, kserve: false, capi: true },
});

describe('isPlatformInstallation', () => {
  it('is any answered installation with kagent, muster or KServe', () => {
    expect(isPlatformInstallation(golem)).toBe(true);
    expect(isPlatformInstallation(wombat)).toBe(true);
    expect(
      isPlatformInstallation(
        entry('kserve-only', {
          components: {
            kagent: false,
            muster: false,
            kserve: true,
            capi: true,
          },
        }),
      ),
    ).toBe(true);
  });

  it('is not an installation switched off in the Cluster access widget', () => {
    expect(isPlatformInstallation(switchedOff)).toBe(false);
  });

  it('is not a CAPI-only cluster, nor an unanswered one', () => {
    expect(isPlatformInstallation(snail)).toBe(false);
    expect(isPlatformInstallation(pending)).toBe(false);
    expect(
      isPlatformInstallation(
        entry('failed', { probe: 'failed', error: new Error('boom') }),
      ),
    ).toBe(false);
  });
});

describe('selectPlatformInstallations', () => {
  const entries = [golem, wombat, snail, pending];

  it('lists the platform installations in inventory order under all', () => {
    expect(
      selectPlatformInstallations(entries, ALL_INSTALLATIONS).map(
        e => e.installation,
      ),
    ).toEqual(['golem', 'wombat']);
  });

  it('keeps a pinned installation listed while its probe is pending', () => {
    expect(
      selectPlatformInstallations(entries, 'slug').map(e => e.installation),
    ).toEqual(['golem', 'wombat', 'slug']);
  });

  it('does not add a pinned installation that answered without the platform', () => {
    expect(
      selectPlatformInstallations(entries, 'snail').map(e => e.installation),
    ).toEqual(['golem', 'wombat']);
  });

  it('does not add a pinned installation the portal does not know', () => {
    expect(
      selectPlatformInstallations(entries, 'nowhere').map(e => e.installation),
    ).toEqual(['golem', 'wombat']);
  });

  it('omits an installation switched off in the Cluster access widget', () => {
    const withSwitchedOff = [...entries, switchedOff];
    expect(
      selectPlatformInstallations(withSwitchedOff, ALL_INSTALLATIONS).map(
        e => e.installation,
      ),
    ).toEqual(['golem', 'wombat']);
    // Not even as the pinned exception: `useInstallationScope` unpins a
    // switched-off installation, so nothing should offer it back.
    expect(
      selectPlatformInstallations(withSwitchedOff, 'yak').map(
        e => e.installation,
      ),
    ).toEqual(['golem', 'wombat']);
  });
});

describe('applyInstallationScope', () => {
  it('passes everything through under all', () => {
    expect(
      applyInstallationScope(['golem', 'wombat'], ALL_INSTALLATIONS),
    ).toEqual(['golem', 'wombat']);
  });

  it('narrows to the pinned installation, or to nothing when it is absent', () => {
    expect(applyInstallationScope(['golem', 'wombat'], 'wombat')).toEqual([
      'wombat',
    ]);
    expect(applyInstallationScope(['golem', 'wombat'], 'snail')).toEqual([]);
  });
});

describe('describeInstallationScopeOption', () => {
  it('says nothing about a healthy installation with the component', () => {
    expect(describeInstallationScopeOption(golem, 'kagent')).toBeUndefined();
    expect(describeInstallationScopeOption(golem)).toBeUndefined();
  });

  it('names the missing component for the current tab', () => {
    expect(describeInstallationScopeOption(wombat, 'kagent')).toBe(
      'no kagent here',
    );
    expect(
      describeInstallationScopeOption(
        entry('k', {
          components: {
            kagent: true,
            muster: false,
            kserve: false,
            capi: true,
          },
        }),
        'kserve',
      ),
    ).toBe('no KServe here');
  });

  it('puts the access state first', () => {
    expect(
      describeInstallationScopeOption(
        entry('out', { accessState: 'session-expired' }),
        'kagent',
      ),
    ).toBe('signed out');
    expect(
      describeInstallationScopeOption(
        entry('down', { accessState: 'degraded' }),
      ),
    ).toBe('not reachable');
  });

  it('says a pending probe is still checking', () => {
    expect(describeInstallationScopeOption(pending, 'kagent')).toBe(
      'checking…',
    );
  });
});

describe('installationsWithoutComponent', () => {
  const withKagent = (name: string, overrides = {}) =>
    entry(name, {
      components: { kagent: true, muster: false, kserve: false, capi: true },
      ...overrides,
    });

  it('names a pinned installation that answered without the component', () => {
    const entries = [withKagent('golem'), entry('dingo')];
    expect(installationsWithoutComponent(entries, 'dingo', 'kagent')).toEqual([
      'dingo',
    ]);
    expect(
      installationsWithoutComponent(entries, 'golem', 'kagent'),
    ).toBeUndefined();
  });

  it('says nothing while the pinned installation has not answered, or is unknown', () => {
    expect(
      installationsWithoutComponent(
        [entry('dingo', { probe: 'pending' })],
        'dingo',
        'kagent',
      ),
    ).toBeUndefined();
    expect(
      installationsWithoutComponent(
        [entry('dingo', { probe: 'failed' })],
        'dingo',
        'kagent',
      ),
    ).toBeUndefined();
    expect(
      installationsWithoutComponent([entry('dingo')], 'old-lab', 'kagent'),
    ).toBeUndefined();
  });

  it('names every active installation under "all" when none runs the component', () => {
    expect(
      installationsWithoutComponent(
        [entry('golem'), entry('dingo'), entry('lab', { muted: true })],
        'all',
        'kagent',
      ),
    ).toEqual(['golem', 'dingo']);
  });

  it('says nothing under "all" while any active installation runs it or has not answered', () => {
    expect(
      installationsWithoutComponent(
        [entry('golem'), withKagent('dingo')],
        'all',
        'kagent',
      ),
    ).toBeUndefined();
    expect(
      installationsWithoutComponent(
        [entry('golem'), entry('dingo', { probe: 'failed' })],
        'all',
        'kagent',
      ),
    ).toBeUndefined();
  });

  it('says nothing under "all" while a switched-off installation runs it', () => {
    expect(
      installationsWithoutComponent(
        [entry('golem'), withKagent('lab', { muted: true })],
        'all',
        'kagent',
      ),
    ).toBeUndefined();
  });
});

describe('installationsWithComponent', () => {
  it('lists the reachable installations that answered with the component, in inventory order', () => {
    const degraded = entry('lynx', {
      accessState: 'degraded',
      components: { kagent: true, muster: true, kserve: false, capi: true },
    });
    expect(
      installationsWithComponent(
        [golem, wombat, pending, switchedOff, degraded],
        'kagent',
      ),
    ).toEqual(['golem']);
    expect(
      installationsWithComponent([golem, wombat, switchedOff], 'muster'),
    ).toEqual(['golem', 'wombat']);
  });
});

describe('installationsSwitchedOffWithComponent', () => {
  it('lists the switched-off installations that run the component under All installations', () => {
    expect(
      installationsSwitchedOffWithComponent(
        [golem, wombat, switchedOff],
        ALL_INSTALLATIONS,
        'kagent',
      ),
    ).toEqual(['yak']);
    expect(
      installationsSwitchedOffWithComponent(
        [golem, switchedOff],
        ALL_INSTALLATIONS,
        'kserve',
      ),
    ).toEqual([]);
  });

  it('lists none under a pinned scope', () => {
    expect(
      installationsSwitchedOffWithComponent(
        [golem, switchedOff],
        'yak',
        'kagent',
      ),
    ).toEqual([]);
  });
});
