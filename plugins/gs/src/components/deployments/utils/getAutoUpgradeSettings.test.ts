import {
  deriveAutoUpgradeMode,
  getAutoUpgradeLabel,
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

  describe('patch upgrades', () => {
    it('detects tilde ranges', () => {
      expect(deriveAutoUpgradeMode({ semver: '~1.2.3' })).toBe(
        'patch-upgrades',
      );
      expect(deriveAutoUpgradeMode({ semver: '~0.1.0' })).toBe(
        'patch-upgrades',
      );
      expect(deriveAutoUpgradeMode({ semver: '~1' })).toBe('patch-upgrades');
      expect(deriveAutoUpgradeMode({ semver: '~2.3' })).toBe('patch-upgrades');
      expect(deriveAutoUpgradeMode({ semver: '~1.2.x' })).toBe(
        'patch-upgrades',
      );
    });

    it('detects patch-level wildcards', () => {
      expect(deriveAutoUpgradeMode({ semver: '1.2.x' })).toBe('patch-upgrades');
      expect(deriveAutoUpgradeMode({ semver: '1.2.X' })).toBe('patch-upgrades');
      expect(deriveAutoUpgradeMode({ semver: '1.2.*' })).toBe('patch-upgrades');
      expect(deriveAutoUpgradeMode({ semver: '0.1.x' })).toBe('patch-upgrades');
    });
  });

  describe('minor upgrades', () => {
    it('detects caret ranges', () => {
      expect(deriveAutoUpgradeMode({ semver: '^1.2.3' })).toBe(
        'minor-upgrades',
      );
      expect(deriveAutoUpgradeMode({ semver: '^0.2.3' })).toBe(
        'minor-upgrades',
      );
      expect(deriveAutoUpgradeMode({ semver: '^0.0.3' })).toBe(
        'minor-upgrades',
      );
    });

    it('detects minor-level wildcards', () => {
      expect(deriveAutoUpgradeMode({ semver: '1.x' })).toBe('minor-upgrades');
      expect(deriveAutoUpgradeMode({ semver: '1.X' })).toBe('minor-upgrades');
      expect(deriveAutoUpgradeMode({ semver: '1.*' })).toBe('minor-upgrades');
      expect(deriveAutoUpgradeMode({ semver: '1.x.x' })).toBe('minor-upgrades');
      expect(deriveAutoUpgradeMode({ semver: '1.X.X' })).toBe('minor-upgrades');
      expect(deriveAutoUpgradeMode({ semver: '1.*.*' })).toBe('minor-upgrades');
    });
  });

  describe('major upgrades', () => {
    it('detects >= ranges', () => {
      expect(deriveAutoUpgradeMode({ semver: '>=1.2.3' })).toBe(
        'major-upgrades',
      );
      expect(deriveAutoUpgradeMode({ semver: '>=0.0.1' })).toBe(
        'major-upgrades',
      );
    });

    it('detects > ranges', () => {
      expect(deriveAutoUpgradeMode({ semver: '>1.2.3' })).toBe(
        'major-upgrades',
      );
      expect(deriveAutoUpgradeMode({ semver: '>0.0.0' })).toBe(
        'major-upgrades',
      );
    });

    it('detects full wildcards', () => {
      expect(deriveAutoUpgradeMode({ semver: '*' })).toBe('major-upgrades');
      expect(deriveAutoUpgradeMode({ semver: 'x' })).toBe('major-upgrades');
      expect(deriveAutoUpgradeMode({ semver: 'X' })).toBe('major-upgrades');
    });
  });

  it('returns no-upgrades for unrecognized patterns', () => {
    expect(deriveAutoUpgradeMode({ semver: '1.2.3' })).toBe('no-upgrades');
    expect(deriveAutoUpgradeMode({ semver: '<2.0.0' })).toBe('no-upgrades');
    expect(deriveAutoUpgradeMode({ semver: '<=1.2.3' })).toBe('no-upgrades');
    expect(deriveAutoUpgradeMode({ semver: '!=1.2.3' })).toBe('no-upgrades');
  });

  it('handles leading/trailing whitespace', () => {
    expect(deriveAutoUpgradeMode({ semver: ' ~1.2.3 ' })).toBe(
      'patch-upgrades',
    );
    expect(deriveAutoUpgradeMode({ semver: ' ^1.2.3 ' })).toBe(
      'minor-upgrades',
    );
    expect(deriveAutoUpgradeMode({ semver: ' >=1.2.3 ' })).toBe(
      'major-upgrades',
    );
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
