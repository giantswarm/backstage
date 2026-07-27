import {
  capabilitiesForVersion,
  FALLBACK_KAGENT_CAPABILITIES,
  MIN_SUPPORTED_KAGENT_VERSION,
} from './kagentCapabilities';

describe('capabilitiesForVersion', () => {
  it('gates the v0.10 surface off for the version GS pins today', () => {
    const capabilities = capabilitiesForVersion('0.9.9');

    expect(capabilities.version).toBe('0.9.9');
    expect(capabilities.hasSessionShares).toBe(false);
    expect(capabilities.canRenameSessionViaPatch).toBe(false);
    expect(capabilities.hasSessionReadOnly).toBe(false);
    expect(capabilities.isBelowMinSupported).toBe(false);
    expect(capabilities.isAboveTestedCeiling).toBe(false);
  });

  it('treats a 0.10 prerelease as having the 0.10 surface', () => {
    // semver.coerce maps v0.10.0-beta9 to 0.10.0 deliberately: the prerelease
    // already carries the 0.10 API, and treating it as 0.9.x would mis-gate.
    const capabilities = capabilitiesForVersion('v0.10.0-beta9');

    expect(capabilities.version).toBe('0.10.0');
    expect(capabilities.rawVersion).toBe('v0.10.0-beta9');
    expect(capabilities.hasSessionShares).toBe(true);
    expect(capabilities.canRenameSessionViaPatch).toBe(true);
    expect(capabilities.hasSessionReadOnly).toBe(true);
    // A prerelease of the ceiling is not above it.
    expect(capabilities.isAboveTestedCeiling).toBe(false);
  });

  it('flags a version below the supported floor', () => {
    const capabilities = capabilitiesForVersion('0.9.8');

    expect(capabilities.isBelowMinSupported).toBe(true);
    // Still usable — the UI shows a notice but keeps rendering rows.
    expect(capabilities.version).toBe('0.9.8');
  });

  it('flags a version above the tested ceiling but keeps flags on', () => {
    const capabilities = capabilitiesForVersion('0.11.2');

    expect(capabilities.isAboveTestedCeiling).toBe(true);
    expect(capabilities.hasSessionShares).toBe(true);
  });

  it.each([
    ['undefined', undefined],
    ['an empty string', ''],
    ['a dev build', 'dev'],
    ['garbage', 'not-a-version'],
  ])('falls back for %s', (_label, input) => {
    expect(capabilitiesForVersion(input)).toEqual(FALLBACK_KAGENT_CAPABILITIES);
  });

  it('never throws', () => {
    expect(() => capabilitiesForVersion('💥')).not.toThrow();
  });

  it('has a fallback equivalent to the oldest supported version', () => {
    // Locks the "degrade to oldest, never optimistically claim a feature"
    // contract: if the floor moves, this test forces the fallback to be revisited.
    const atFloor = capabilitiesForVersion(MIN_SUPPORTED_KAGENT_VERSION);

    expect(FALLBACK_KAGENT_CAPABILITIES).toEqual({
      ...atFloor,
      version: undefined,
      rawVersion: undefined,
    });
  });
});
