import {
  classifyInventoryFailure,
  inventoryFailureCopy,
  selectInventoryFailure,
} from './inventoryFailure';
import { InventoryProbeError } from './probeInstallationInventory';
import type { InstallationInventoryEntry } from './types';

const NONE = { kagent: false, muster: false, kserve: false, capi: false };

function entry(
  installation: string,
  overrides: Partial<InstallationInventoryEntry> = {},
): InstallationInventoryEntry {
  return {
    installation,
    home: installation === 'gazelle',
    accessState: 'healthy',
    probe: 'answered',
    components: NONE,
    ...overrides,
  };
}

function failed(installation: string, error: Error) {
  return entry(installation, { probe: 'failed', error });
}

const unauthorized = new InventoryProbeError('gazelle', 401, '');
const forbidden = new InventoryProbeError('golem', 403, 'Forbidden');
const unavailable = new InventoryProbeError('snail', 503, '');
const timedOut = new Error('Request to cluster snail timed out after 30000ms');

describe('classifyInventoryFailure', () => {
  it('has nothing to say about a pending or answered probe', () => {
    expect(classifyInventoryFailure(entry('gazelle'))).toBeUndefined();
    expect(
      classifyInventoryFailure(entry('gazelle', { probe: 'pending' })),
    ).toBeUndefined();
    // Failed without an error to quote: nothing to classify either.
    expect(
      classifyInventoryFailure(entry('gazelle', { probe: 'failed' })),
    ).toBeUndefined();
  });

  it('classifies by the error name the probe gave the status', () => {
    expect(classifyInventoryFailure(failed('gazelle', unauthorized))).toEqual({
      installation: 'gazelle',
      kind: 'unauthorized',
      error: unauthorized,
    });
    expect(classifyInventoryFailure(failed('golem', forbidden))).toEqual({
      installation: 'golem',
      kind: 'forbidden',
      error: forbidden,
    });
    expect(classifyInventoryFailure(failed('snail', unavailable))?.kind).toBe(
      'error',
    );
    expect(classifyInventoryFailure(failed('snail', timedOut))?.kind).toBe(
      'error',
    );
  });
});

describe('selectInventoryFailure', () => {
  const inventory = {
    home: 'gazelle',
    entries: [
      failed('gazelle', unauthorized),
      failed('golem', forbidden),
      entry('wombat'),
    ],
  };

  it('explains the home installation\'s failure under "All installations"', () => {
    expect(selectInventoryFailure(inventory, null)).toMatchObject({
      installation: 'gazelle',
      kind: 'unauthorized',
    });
    expect(selectInventoryFailure(inventory, undefined)).toMatchObject({
      installation: 'gazelle',
    });
  });

  it("explains the pinned installation's failure, not the home's", () => {
    expect(selectInventoryFailure(inventory, 'golem')).toMatchObject({
      installation: 'golem',
      kind: 'forbidden',
    });
  });

  it('has nothing to explain when the pinned installation answered', () => {
    // The home failed, but the tab shows the pinned installation alone.
    expect(selectInventoryFailure(inventory, 'wombat')).toBeUndefined();
  });

  it("falls back to the home installation's failure when asked to", () => {
    // The muster section shows the home when the pinned installation runs no
    // muster: the home's failure is then the reason the section is empty.
    expect(
      selectInventoryFailure(inventory, 'wombat', { fallBackToHome: true }),
    ).toMatchObject({ installation: 'gazelle', kind: 'unauthorized' });
    // A pinned failure still wins over the home's.
    expect(
      selectInventoryFailure(inventory, 'golem', { fallBackToHome: true }),
    ).toMatchObject({ installation: 'golem', kind: 'forbidden' });
  });

  it('falls back to the home for a pinned installation the portal does not know', () => {
    expect(selectInventoryFailure(inventory, 'ferret')).toMatchObject({
      installation: 'gazelle',
    });
  });

  it('is undefined without a home to explain', () => {
    expect(
      selectInventoryFailure({ home: undefined, entries: [] }, null),
    ).toBeUndefined();
    expect(
      selectInventoryFailure(
        { home: 'gazelle', entries: [entry('gazelle')] },
        null,
      ),
    ).toBeUndefined();
  });
});

describe('inventoryFailureCopy', () => {
  it('names the installation, quotes the 401 and offers the sign-out', () => {
    expect(
      inventoryFailureCopy({
        installation: 'gazelle',
        kind: 'unauthorized',
        error: unauthorized,
      }),
    ).toEqual({
      badge: 'Token rejected',
      sentence:
        "The API server of gazelle rejected the portal's token (HTTP 401): your sign-in did not grant what it requires, and a silent refresh cannot repair that. Sign out of the portal and sign in again.",
      action: 'Sign out',
    });
  });

  it('quotes the reason phrase of a 403 and offers a retry', () => {
    expect(
      inventoryFailureCopy({
        installation: 'golem',
        kind: 'forbidden',
        error: forbidden,
      }),
    ).toEqual({
      badge: 'Access denied',
      sentence:
        'The API server of golem refused to list its API groups (HTTP 403 Forbidden), a read every signed-in account is normally allowed. Ask the administrators of golem about your access.',
      action: 'Retry',
    });
  });

  it("quotes the error's own words when the probe never answered", () => {
    expect(
      inventoryFailureCopy({
        installation: 'snail',
        kind: 'error',
        error: timedOut,
      }),
    ).toEqual({
      badge: 'Probe failed',
      sentence:
        'Reading the API groups of snail failed (Request to cluster snail timed out after 30000ms).',
      action: 'Retry',
    });
    expect(
      inventoryFailureCopy({
        installation: 'snail',
        kind: 'error',
        error: unavailable,
      }).sentence,
    ).toBe('Reading the API groups of snail failed (HTTP 503).');
  });

  it.each(['unauthorized', 'forbidden', 'error'] as const)(
    'never says a bare "failed" or "not authenticated" (%s)',
    kind => {
      const { sentence } = inventoryFailureCopy({
        installation: 'gazelle',
        kind,
        error: unauthorized,
      });
      expect(sentence).toMatch(/gazelle/);
      expect(sentence).not.toMatch(/not authenticated/i);
      expect(sentence).not.toBe('Failed.');
    },
  );
});
