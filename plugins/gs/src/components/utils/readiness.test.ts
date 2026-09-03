import {
  READINESS_INTENTS,
  READINESS_LABELS,
  READINESS_MEANINGS,
  READINESS_ORDER,
  partitionReadinessFlags,
  readinessIntent,
  readinessLabel,
  readinessRank,
} from './readiness';

describe('readiness presentation', () => {
  it('describes every verdict in every map', () => {
    // The drift guard: a verdict added to one map and forgotten in another is
    // what produced a raw lowercase value in the sidebar before.
    for (const verdict of READINESS_ORDER) {
      expect(READINESS_LABELS[verdict]).toBeDefined();
      expect(READINESS_INTENTS[verdict]).toBeDefined();
      expect(READINESS_MEANINGS[verdict]).toBeDefined();
    }
    expect(Object.keys(READINESS_LABELS).sort()).toEqual(
      [...READINESS_ORDER].sort(),
    );
    expect(Object.keys(READINESS_INTENTS).sort()).toEqual(
      [...READINESS_ORDER].sort(),
    );
  });

  it('leads with what needs attention', () => {
    expect(READINESS_ORDER).toEqual(['blocked', 'unknown', 'releasable']);
    expect(readinessRank('blocked')).toBeLessThan(readinessRank('unknown'));
    expect(readinessRank('unknown')).toBeLessThan(readinessRank('releasable'));
  });

  it('sorts a verdict it does not know about last, not first', () => {
    expect(readinessRank('something-new')).toBeGreaterThan(
      readinessRank('releasable'),
    );
    expect(readinessRank(undefined)).toBeGreaterThan(
      readinessRank('releasable'),
    );
  });

  it('falls back to the raw value rather than rendering nothing', () => {
    expect(readinessLabel('something-new')).toBe('something-new');
    expect(readinessIntent('something-new')).toBe('neutral');
  });

  it('splits the merged flag list by the verdict that wrote it', () => {
    const { release, chartMetadata } = partitionReadinessFlags([
      'NO-VALUES-SCHEMA',
      'NEVER-PUBLISHED',
      'META-NO-TEAM',
    ]);

    expect(release).toEqual(['NEVER-PUBLISHED']);
    expect(chartMetadata).toEqual(['NO-VALUES-SCHEMA', 'META-NO-TEAM']);
  });

  it('treats an unrecognised flag as chart metadata, not as a release blocker', () => {
    // The importer owns the open-ended half of the list, so a new flag from it
    // must not be attributed to the release verdict.
    expect(partitionReadinessFlags(['SOME-NEW-META-FLAG'])).toEqual({
      release: [],
      chartMetadata: ['SOME-NEW-META-FLAG'],
    });
  });
});
