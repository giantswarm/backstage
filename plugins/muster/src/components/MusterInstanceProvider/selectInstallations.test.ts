import type { InstallationInventoryEntry } from '@giantswarm/backstage-plugin-gs';
import type { MusterInstallationInfo } from '../../apis/types';
import {
  homeFirst,
  InventoryView,
  selectMusterInstallations,
} from './selectInstallations';

// What the backend can target: gazelle and golem are configured, wombat and
// snail derived from their base domains (the backend cannot tell whether they
// run muster), lab is configured but unknown to the fleet configuration.
const BACKEND: MusterInstallationInfo[] = [
  { name: 'wombat', requiresAuth: true, source: 'derived' },
  { name: 'golem', requiresAuth: true, source: 'configured' },
  { name: 'gazelle', requiresAuth: true, source: 'configured' },
  { name: 'snail', requiresAuth: true, source: 'derived' },
  { name: 'lab', requiresAuth: true, source: 'configured' },
];

type EntryInput = Partial<InstallationInventoryEntry> & {
  installation: string;
};

function entry(input: EntryInput): InstallationInventoryEntry {
  return {
    home: false,
    accessState: 'healthy',
    probe: 'answered',
    components: { kagent: false, muster: false, kserve: false, capi: false },
    ...input,
  };
}

function withMuster(input: EntryInput): InstallationInventoryEntry {
  return entry({
    ...input,
    components: { kagent: false, muster: true, kserve: false, capi: false },
  });
}

/** An inventory with `installationsWith` computed the way the gs hook does. */
function inventory(
  entries: InstallationInventoryEntry[],
  home = 'gazelle',
): InventoryView {
  return {
    entries,
    home,
    installationsWith: component =>
      entries
        .filter(
          e =>
            e.probe === 'answered' &&
            e.components[component] &&
            e.accessState === 'healthy',
        )
        .map(e => e.installation),
  };
}

const names = (infos: MusterInstallationInfo[]) => infos.map(i => i.name);

describe('selectMusterInstallations', () => {
  it('lists the backend installations whose inventory has muster, home first', () => {
    const inv = inventory([
      withMuster({ installation: 'gazelle', home: true }),
      withMuster({ installation: 'golem' }),
      // Derived by the backend, but runs no muster.
      entry({ installation: 'wombat' }),
      withMuster({ installation: 'snail' }),
    ]);

    const listed = selectMusterInstallations(BACKEND, inv, null);

    expect(names(listed)).toEqual(['gazelle', 'golem', 'snail']);
    // The backend's own fields travel along.
    expect(listed[2]).toEqual({
      name: 'snail',
      requiresAuth: true,
      source: 'derived',
    });
  });

  it('drops an installation whose inventory has muster but which the backend cannot target', () => {
    const inv = inventory([
      withMuster({ installation: 'gazelle', home: true }),
      withMuster({ installation: 'ferret' }),
    ]);

    expect(names(selectMusterInstallations(BACKEND, inv, null))).toEqual([
      'gazelle',
    ]);
  });

  it('drops a backend installation the fleet configuration does not know', () => {
    const inv = inventory([
      withMuster({ installation: 'gazelle', home: true }),
    ]);

    expect(names(selectMusterInstallations(BACKEND, inv, 'lab'))).toEqual([
      'gazelle',
    ]);
  });

  it('drops an installation with muster whose cluster access is not healthy', () => {
    const inv = inventory([
      withMuster({ installation: 'gazelle', home: true }),
      withMuster({ installation: 'golem', accessState: 'session-expired' }),
    ]);

    expect(names(selectMusterInstallations(BACKEND, inv, null))).toEqual([
      'gazelle',
    ]);
  });

  it('falls back to the whole backend list when the portal has no inventory at all', () => {
    // The legacy single-installation setup: no gs.installations, so nothing
    // the inventory could say; the backend's list is all there is.
    const inv = inventory([], undefined);

    expect(selectMusterInstallations(BACKEND, inv, null)).toEqual(BACKEND);
  });

  describe("the person's explicit choice while its probe is pending", () => {
    it('stays listed while the probe can still answer', () => {
      const inv = inventory([
        withMuster({ installation: 'gazelle', home: true }),
        entry({ installation: 'golem', probe: 'pending' }),
        entry({
          installation: 'snail',
          probe: 'pending',
          accessState: 'connecting',
        }),
      ]);

      expect(names(selectMusterInstallations(BACKEND, inv, 'golem'))).toEqual([
        'gazelle',
        'golem',
      ]);
      expect(names(selectMusterInstallations(BACKEND, inv, 'snail'))).toEqual([
        'gazelle',
        'snail',
      ]);
    });

    it('is not listed once the probe answered without muster, or failed', () => {
      const inv = inventory([
        withMuster({ installation: 'gazelle', home: true }),
        entry({ installation: 'golem' }),
        entry({ installation: 'snail', probe: 'failed' }),
      ]);

      expect(names(selectMusterInstallations(BACKEND, inv, 'golem'))).toEqual([
        'gazelle',
      ]);
      expect(names(selectMusterInstallations(BACKEND, inv, 'snail'))).toEqual([
        'gazelle',
      ]);
    });

    it('is not listed while its cluster access cannot answer', () => {
      const inv = inventory([
        withMuster({ installation: 'gazelle', home: true }),
        entry({
          installation: 'golem',
          probe: 'pending',
          accessState: 'session-expired',
        }),
      ]);

      expect(names(selectMusterInstallations(BACKEND, inv, 'golem'))).toEqual([
        'gazelle',
      ]);
    });

    it('does not keep any other pending installation', () => {
      const inv = inventory([
        withMuster({ installation: 'gazelle', home: true }),
        entry({ installation: 'golem', probe: 'pending' }),
        entry({ installation: 'snail', probe: 'pending' }),
      ]);

      expect(names(selectMusterInstallations(BACKEND, inv, 'golem'))).toEqual([
        'gazelle',
        'golem',
      ]);
    });
  });

  it('puts the home installation first even when the backend lists it last', () => {
    const inv = inventory(
      [
        withMuster({ installation: 'wombat' }),
        withMuster({ installation: 'golem' }),
        withMuster({ installation: 'gazelle', home: true }),
      ],
      'gazelle',
    );

    expect(names(selectMusterInstallations(BACKEND, inv, null))).toEqual([
      'gazelle',
      'wombat',
      'golem',
    ]);
  });
});

describe('homeFirst', () => {
  it('moves home to the front and keeps the rest in order', () => {
    const list = [{ name: 'b' }, { name: 'home' }, { name: 'a' }];
    expect(homeFirst(list, 'home').map(i => i.name)).toEqual([
      'home',
      'b',
      'a',
    ]);
  });

  it('leaves the order alone without a home or when home is absent', () => {
    const list = [{ name: 'b' }, { name: 'a' }];
    expect(homeFirst(list, undefined)).toBe(list);
    expect(homeFirst(list, 'zzz')).toBe(list);
  });
});
