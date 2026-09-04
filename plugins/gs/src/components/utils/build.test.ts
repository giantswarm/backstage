import {
  BUILD_STATUS_INTENTS,
  BUILD_STATUS_LABELS,
  BUILD_STATUS_MEANINGS,
  BUILD_STATUS_ORDER,
  buildStatusIntent,
  buildStatusLabel,
  buildStatusRank,
  compareOrbVersionsDesc,
  toolchainOrbText,
  toolchainTitle,
} from './build';

describe('build status presentation', () => {
  it('describes every verdict in every map', () => {
    for (const verdict of BUILD_STATUS_ORDER) {
      expect(BUILD_STATUS_LABELS[verdict]).toBeDefined();
      expect(BUILD_STATUS_INTENTS[verdict]).toBeDefined();
      expect(BUILD_STATUS_MEANINGS[verdict]).toBeDefined();
    }
    expect(Object.keys(BUILD_STATUS_LABELS).sort()).toEqual(
      [...BUILD_STATUS_ORDER].sort(),
    );
  });

  it('leads with what needs attention', () => {
    expect(BUILD_STATUS_ORDER).toEqual(['failing', 'unknown', 'passing']);
    expect(buildStatusRank('failing')).toBeLessThan(buildStatusRank('unknown'));
    expect(buildStatusRank('unknown')).toBeLessThan(buildStatusRank('passing'));
    expect(buildStatusRank(undefined)).toBeGreaterThan(
      buildStatusRank('passing'),
    );
  });

  it('falls back to the raw value rather than rendering nothing', () => {
    expect(buildStatusLabel('something-new')).toBe('something-new');
    expect(buildStatusIntent('something-new')).toBe('neutral');
  });
});

describe('toolchain presentation', () => {
  it('shows the release version, or the raw ref when the pin is not a release', () => {
    expect(toolchainOrbText({ orbVersion: '10.3.0' })).toBe('10.3.0');
    expect(toolchainOrbText({ orbRef: 'dev:abc123' })).toBe('dev:abc123');
    expect(toolchainOrbText({})).toBe('');
  });

  it('names each tool in full and marks a repo override', () => {
    expect(
      toolchainTitle({
        orbVersion: '10.3.0',
        absVersion: '2.3.0',
        atsVersion: '0.15.0',
        atsSource: 'repo',
      }),
    ).toBe(
      'architect orb 10.3.0\napp-build-suite 2.3.0\napp-test-suite 0.15.0 (repo override)',
    );
    expect(toolchainTitle({ orbVersion: '9.6.0', atsVersion: '0.15.0' })).toBe(
      'architect orb 9.6.0\napp-test-suite 0.15.0',
    );
  });

  it('says a non-release pin is one', () => {
    expect(toolchainTitle({ orbRef: 'volatile' })).toMatch(/not a release/);
  });

  it('orders versions newest first and non-release pins last', () => {
    expect(
      ['10.2.0', 'dev:abc', '10.10.0', '9.6.0', 'volatile'].sort(
        compareOrbVersionsDesc,
      ),
    ).toEqual(['10.10.0', '10.2.0', '9.6.0', 'dev:abc', 'volatile']);
  });
});
