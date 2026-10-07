import {
  deriveAutoUpgradeMode,
  deriveAutoUpgradeSettings,
  deriveChartVersion,
  describeAutoUpgrades,
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

describe('deriveAutoUpgradeSettings', () => {
  it('reads the filter and the pre-release range', () => {
    expect(
      deriveAutoUpgradeSettings({
        semver: '>=0.0.0-0',
        semverFilter: '.*-rc\\..*',
      }),
    ).toEqual({
      mode: 'major-upgrades',
      semverFilter: '.*-rc\\..*',
      includePrereleases: true,
    });
  });

  it.each([
    ['>=0.0.0', false],
    ['>=0.0.0-0', true],
    ['^1.2.3-rc.1', true],
    ['1.2.3 - 2.0.0', false],
    ['~1.2.3-0 || >=2.0.0', true],
  ])('reads whether %s admits pre-releases', (semver, includePrereleases) => {
    expect(deriveAutoUpgradeSettings({ semver }).includePrereleases).toBe(
      includePrereleases,
    );
  });

  it('ignores an empty filter', () => {
    expect(
      deriveAutoUpgradeSettings({ semver: '>=0.0.0-0', semverFilter: '' })
        .semverFilter,
    ).toBeUndefined();
  });

  it('ignores filter and range where Flux does: without a range or with a digest', () => {
    const none = {
      mode: 'no-upgrades',
      semverFilter: undefined,
      includePrereleases: false,
    };
    expect(
      deriveAutoUpgradeSettings({ tag: '1.2.3', semverFilter: '.*-rc\\..*' }),
    ).toEqual(none);
    expect(
      deriveAutoUpgradeSettings({
        semver: '>=0.0.0-0',
        semverFilter: '.*-rc\\..*',
        digest: 'sha256:abc',
      }),
    ).toEqual(none);
    expect(deriveAutoUpgradeSettings(undefined)).toEqual(none);
  });
});

describe('describeAutoUpgrades', () => {
  const describe_ = (semver: string, semverFilter?: string) =>
    describeAutoUpgrades(deriveAutoUpgradeSettings({ semver, semverFilter }));

  // The seven scenarios of the SemVer automatic upgrades guide, `semver` and
  // `semverFilter` as it documents them.
  it.each([
    ['1. stable, patch only', '1.2.x', undefined, 'Patch'],
    ['2. stable, patch or minor', '1.x', undefined, 'Minor and patch'],
    ['3. any stable tag', '>=0.0.0', undefined, 'Any'],
    [
      '4. dev builds only',
      '>=0.0.0-0',
      '^.*-r[0-9a-f]{8}t[0-9]{14}h[0-9a-f]{7}$',
      'Dev builds only',
    ],
    [
      '5. release candidates only',
      '>=0.0.0-0',
      '.*-rc\\..*',
      'Release candidates only',
    ],
    [
      '6. any RC or stable tag',
      '>=0.0.0-0',
      '^[0-9]+\\.[0-9]+\\.[0-9]+(-rc\\.[0-9]+)?$',
      'Release candidates or stable',
    ],
    ['7. any tag', '>=0.0.0-0', undefined, 'Any, including pre-releases'],
  ])('scenario %s', (_scenario, semver, semverFilter, label) => {
    expect(describe_(semver, semverFilter)).toEqual({ label });
  });

  it('shows a filter the guide does not document as its regular expression', () => {
    expect(describe_('>=0.0.0-0', '^1\\.2\\.4-rc\\..*')).toEqual({
      label: 'Tags matching',
      filter: '^1\\.2\\.4-rc\\..*',
    });
    expect(describe_('~1.2.3-0', '^1\\.2\\.4-rc\\..*')).toEqual({
      label: 'Patch, tags matching',
      filter: '^1\\.2\\.4-rc\\..*',
    });
  });

  it('keeps the mode of a range narrower than any', () => {
    expect(describe_('^1.2.3-0', '.*-rc\\..*')).toEqual({
      label: 'Minor and patch, release candidates only',
    });
  });

  it('flags a release stage the range admits no pre-release for', () => {
    expect(describe_('>=0.0.0', '.*-rc\\..*')).toEqual({
      label: 'Release candidates only, but the range admits no pre-release',
    });
  });

  it('never resolves a filter to an Object.prototype member', () => {
    for (const filter of ['constructor', 'toString', '__proto__']) {
      expect(describe_('>=0.0.0-0', filter)).toEqual({
        label: 'Tags matching',
        filter,
      });
    }
  });

  it('shows None when there are no upgrades to filter', () => {
    expect(
      describeAutoUpgrades({
        mode: 'no-upgrades',
        semverFilter: '.*-rc\\..*',
        includePrereleases: true,
      }),
    ).toEqual({ label: 'None' });
  });
});
