import { NO_PLATFORM_COMPONENTS } from '../../../apis/installationInventory';
import type { InstallationInventoryEntry } from '../../../apis/installationInventory';
import { readabilityOf } from './readability';

const entry = (
  overrides: Partial<InstallationInventoryEntry>,
): InstallationInventoryEntry => ({
  installation: 'rowan',
  home: false,
  accessState: 'healthy',
  muted: false,
  probe: 'answered',
  components: NO_PLATFORM_COMPONENTS,
  ...overrides,
});

describe('readabilityOf', () => {
  it('is unknown for an installation this portal is not configured for', () => {
    expect(readabilityOf(undefined)).toEqual({ state: 'unknown' });
  });

  it('is readable once the inventory probe answered', () => {
    expect(readabilityOf(entry({}))).toEqual({ state: 'readable' });
  });

  it('is not readable when the installation refused the probe', () => {
    for (const name of ['ForbiddenError', 'UnauthorizedError']) {
      const error = Object.assign(new Error(`GET /apis: ${name}`), { name });
      expect(readabilityOf(entry({ probe: 'failed', error }))).toEqual({
        state: 'not readable',
        reason: `GET /apis: ${name}`,
      });
    }
  });

  it('is unknown while the probe is pending or failed for another reason', () => {
    expect(readabilityOf(entry({ probe: 'pending' }))).toEqual({
      state: 'unknown',
    });
    const error = Object.assign(new Error('timeout'), {
      name: 'ServiceUnavailableError',
    });
    expect(readabilityOf(entry({ probe: 'failed', error }))).toEqual({
      state: 'unknown',
    });
  });
});
