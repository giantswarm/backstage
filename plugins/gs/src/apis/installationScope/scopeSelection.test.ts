import type { InstallationInventoryEntry } from '../installationInventory/types';
import { ALL_INSTALLATIONS } from './installationScopeStore';
import {
  applyInstallationScope,
  describeInstallationScopeOption,
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
