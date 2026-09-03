import type { Entity } from '@backstage/catalog-model';
import {
  getChartMetadataStyleFromEntity,
  getReadinessAdvisoryFromEntity,
  getReadinessCheckedFromEntity,
  getReadinessFlagsFromEntity,
  getReadinessFromEntity,
  getReadinessStandardsFromEntity,
  isEntityReadinessAvailable,
  isEntityReleaseVerdictAvailable,
} from './entity';

function entity(
  labels: Record<string, string> = {},
  annotations: Record<string, string> = {},
): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'my-app', labels, annotations },
  };
}

describe('readiness entity helpers', () => {
  it('gates the column on the release verdict alone', () => {
    expect(
      isEntityReleaseVerdictAvailable(
        entity({ 'giantswarm.io/readiness': 'blocked' }),
      ),
    ).toBe(true);
    // Importer data alone puts nothing in a release-readiness cell.
    expect(
      isEntityReleaseVerdictAvailable(
        entity({ 'giantswarm.io/readiness-standards': 'incomplete' }),
      ),
    ).toBe(false);
    expect(isEntityReleaseVerdictAvailable(entity())).toBe(false);
  });

  it('gates the card on either source of readiness data', () => {
    expect(
      isEntityReadinessAvailable(
        entity({ 'giantswarm.io/readiness': 'blocked' }),
      ),
    ).toBe(true);
    // What every component looks like today: the importer publishes, the
    // processor ships disabled. The card still has plenty to say.
    expect(
      isEntityReadinessAvailable(
        entity({ 'giantswarm.io/readiness-standards': 'incomplete' }),
      ),
    ).toBe(true);
    expect(isEntityReadinessAvailable(entity())).toBe(false);
  });

  it('reads the verdict and the standards verdict as separate labels', () => {
    const e = entity({
      'giantswarm.io/readiness': 'releasable',
      'giantswarm.io/readiness-standards': 'incomplete',
    });
    expect(getReadinessFromEntity(e)).toBe('releasable');
    expect(getReadinessStandardsFromEntity(e)).toBe('incomplete');
  });

  it('splits flag lists and trims them', () => {
    const e = entity(
      {},
      {
        'giantswarm.io/readiness-flags': 'NO-VALUES-SCHEMA, META-NO-TEAM',
        'giantswarm.io/readiness-advisory': 'CHART-NO-KEYWORDS',
      },
    );
    expect(getReadinessFlagsFromEntity(e)).toEqual([
      'NO-VALUES-SCHEMA',
      'META-NO-TEAM',
    ]);
    expect(getReadinessAdvisoryFromEntity(e)).toEqual(['CHART-NO-KEYWORDS']);
  });

  it('returns an empty list rather than [""] when a flag annotation is absent', () => {
    expect(getReadinessFlagsFromEntity(entity())).toEqual([]);
    expect(getReadinessAdvisoryFromEntity(entity())).toEqual([]);
  });

  it('drops empty entries from a trailing comma', () => {
    const e = entity({}, { 'giantswarm.io/readiness-flags': 'META-NO-TEAM,,' });
    expect(getReadinessFlagsFromEntity(e)).toEqual(['META-NO-TEAM']);
  });

  it('reads the checked timestamp and the metadata style', () => {
    const e = entity(
      {},
      {
        'giantswarm.io/readiness-checked': '2026-08-20T09:14:00Z',
        'giantswarm.io/chart-metadata-style': 'legacy',
      },
    );
    expect(getReadinessCheckedFromEntity(e)).toBe('2026-08-20T09:14:00Z');
    expect(getChartMetadataStyleFromEntity(e)).toBe('legacy');
  });
});
