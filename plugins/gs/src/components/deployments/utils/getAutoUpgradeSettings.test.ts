import {
  deriveAutoUpgradeMode,
  deriveChartVersion,
  getAutoUpgradeLabel,
  versionFromRevision,
} from './getAutoUpgradeSettings';

describe('deriveAutoUpgradeMode', () => {
  it('returns no-upgrades when ref is undefined', () => {
    expect(deriveAutoUpgradeMode(undefined)).toBe('no-upgrades');
  });

  it('returns no-upgrades when only tag is set', () => {
    expect(deriveAutoUpgradeMode({ tag: '1.2.3' })).toBe('no-upgrades');
  });

  it('returns no-upgrades when semver is not set', () => {
    expect(deriveAutoUpgradeMode({ tag: '1.2.3', semver: undefined })).toBe(
      'no-upgrades',
    );
  });

  it('returns no-upgrades for a range it cannot parse', () => {
    expect(deriveAutoUpgradeMode({ semver: 'latest' })).toBe('no-upgrades');
  });

  it.each([
    // Tilde ranges
    ['~1.2.3', 'patch-upgrades'],
    ['~0.1.0', 'patch-upgrades'],
    ['~2.3', 'patch-upgrades'],
    ['~1.2.x', 'patch-upgrades'],
    // `~1` is `>=1.0.0 <2.0.0`
    ['~1', 'minor-upgrades'],
    // Wildcards
    ['1.2.x', 'patch-upgrades'],
    ['1.2.X', 'patch-upgrades'],
    ['1.2.*', 'patch-upgrades'],
    ['0.1.x', 'patch-upgrades'],
    ['1.x', 'minor-upgrades'],
    ['1.X', 'minor-upgrades'],
    ['1.*', 'minor-upgrades'],
    ['1.x.x', 'minor-upgrades'],
    ['1.X.X', 'minor-upgrades'],
    ['1.*.*', 'minor-upgrades'],
    ['*', 'major-upgrades'],
    ['x', 'major-upgrades'],
    ['X', 'major-upgrades'],
    ['x.x.x', 'major-upgrades'],
    ['X.X.X', 'major-upgrades'],
    ['*.*.*', 'major-upgrades'],
    ['x.x', 'major-upgrades'],
    ['*.*', 'major-upgrades'],
    // Caret ranges keep the leftmost non-zero part
    ['^1.2.3', 'minor-upgrades'],
    ['^0.2.3', 'patch-upgrades'],
    ['^0.0.3', 'no-upgrades'],
    // Comparison operators
    ['>=1.2.3', 'major-upgrades'],
    ['>=0.0.1', 'major-upgrades'],
    ['>1.2.3', 'major-upgrades'],
    ['>0.0.0', 'major-upgrades'],
    // Bounded ranges
    ['>=1.2.3 <2.0.0', 'minor-upgrades'],
    ['>=1.2.0, <1.3.0', 'patch-upgrades'],
    ['1.2.3 - 1.4.0', 'minor-upgrades'],
    ['^1.2.3 || ^2.0.0', 'major-upgrades'],
    // Gaps from exclusions and alternatives
    ['>=1.2.3, !=2.0.0', 'major-upgrades'],
    ['^1.2.3 || ^3.0.0', 'major-upgrades'],
    ['~1.2.3 || ~1.4.0', 'minor-upgrades'],
    ['~1.2.3, !=1.2.4', 'patch-upgrades'],
    // A single version
    ['1.2.3', 'no-upgrades'],
    // Surrounding whitespace
    [' ~1.2.3 ', 'patch-upgrades'],
    [' ^1.2.3 ', 'minor-upgrades'],
    [' >=1.2.3 ', 'major-upgrades'],
  ])('reads %s as %s', (semver, mode) => {
    expect(deriveAutoUpgradeMode({ semver })).toBe(mode);
  });

  it.each([
    ['<2.0.0', '1.5.0', 'minor-upgrades'],
    ['<=1.2.3', '1.2.3', 'no-upgrades'],
    ['!=1.2.3', '1.2.4', 'major-upgrades'],
    ['>=1.0.0 <1.5.0', '1.4.9', 'patch-upgrades'],
  ])(
    'reads %s from the current version %s as %s',
    (semver, currentVersion, mode) => {
      expect(deriveAutoUpgradeMode({ semver }, currentVersion)).toBe(mode);
    },
  );

  it('returns no-upgrades for a digest, which takes precedence over semver', () => {
    expect(
      deriveAutoUpgradeMode({ digest: 'sha256:abc', semver: '^1.2.0' }),
    ).toBe('no-upgrades');
  });

  it('starts from the lowest admitted version when the current one is outside the range', () => {
    expect(deriveAutoUpgradeMode({ semver: '^1.2.3' }, '0.9.0')).toBe(
      'minor-upgrades',
    );
  });
});

describe('deriveChartVersion', () => {
  it('returns the pinned tag', () => {
    expect(deriveChartVersion({ tag: '1.2.3' })).toBe('1.2.3');
  });

  it('prefers a semver range over a tag, as Flux does', () => {
    expect(
      deriveChartVersion({ tag: '1.0.0', semver: '^1.2.0' }, '1.5.0'),
    ).toBe('1.5.0');
  });

  it('returns the tag for a digest, which takes precedence over semver', () => {
    expect(
      deriveChartVersion(
        { digest: 'sha256:abc', tag: '1.0.0', semver: '^1.2.0' },
        '1.5.0',
      ),
    ).toBe('1.0.0');
  });

  it('returns the current version when the range admits it', () => {
    expect(deriveChartVersion({ semver: '>=1.2.3 <2.0.0' }, '1.4.0')).toBe(
      '1.4.0',
    );
  });

  it.each([
    ['>=1.2.3 <2.0.0', '1.2.3'],
    ['~1.2', '1.2.0'],
    ['1.x', '1.0.0'],
    ['>1.2.3', '1.2.4'],
  ])('returns the lowest version %s admits: %s', (semver, version) => {
    expect(deriveChartVersion({ semver })).toBe(version);
  });

  it('returns the lowest version of a range starting at zero', () => {
    expect(deriveChartVersion({ semver: '>= 0.0.0-0' })).toBe('0.0.0-0');
    expect(deriveChartVersion({ semver: '*' })).toBe('0.0.0');
  });

  it('returns no version for a range no version satisfies', () => {
    expect(deriveChartVersion({ semver: '>=2.0.0 <1.0.0' })).toBeUndefined();
  });

  it('returns no version for no reference', () => {
    expect(deriveChartVersion(undefined)).toBeUndefined();
  });
});

describe('versionFromRevision', () => {
  it('reads the version before the digest', () => {
    expect(versionFromRevision('1.2.3@sha256:abc')).toBe('1.2.3');
  });

  it('reads the revision format from before Flux 2.0', () => {
    expect(versionFromRevision('1.9.0/sha256:abc')).toBe('1.9.0');
  });

  it('returns undefined for no revision', () => {
    expect(versionFromRevision(undefined)).toBeUndefined();
    expect(versionFromRevision('')).toBeUndefined();
  });
});

describe('getAutoUpgradeLabel', () => {
  it('returns human-readable labels', () => {
    expect(getAutoUpgradeLabel('no-upgrades')).toBe('None');
    expect(getAutoUpgradeLabel('patch-upgrades')).toBe('Patch');
    expect(getAutoUpgradeLabel('minor-upgrades')).toBe('Minor and patch');
    expect(getAutoUpgradeLabel('major-upgrades')).toBe('Any');
  });
});
