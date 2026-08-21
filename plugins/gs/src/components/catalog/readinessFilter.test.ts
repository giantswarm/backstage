import type { Entity } from '@backstage/catalog-model';
import { EntityReadinessFilter } from './filters';

function component(readiness?: string): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: {
      name: 'my-app',
      labels: readiness ? { 'giantswarm.io/readiness': readiness } : {},
    },
  };
}

describe('EntityReadinessFilter', () => {
  it('filters server-side on the label, not an annotation', () => {
    // The catalog API can only filter on labels, which is why the verdict is
    // one.
    expect(new EntityReadinessFilter(['blocked']).getCatalogFilters()).toEqual({
      'metadata.labels.giantswarm.io/readiness': ['blocked'],
    });
  });

  it('matches any of the selected verdicts', () => {
    const filter = new EntityReadinessFilter(['blocked', 'unknown']);
    expect(filter.filterEntity(component('blocked'))).toBe(true);
    expect(filter.filterEntity(component('unknown'))).toBe(true);
    expect(filter.filterEntity(component('releasable'))).toBe(false);
  });

  it('does not match an entity with no verdict', () => {
    expect(
      new EntityReadinessFilter(['releasable']).filterEntity(component()),
    ).toBe(false);
  });

  it('round-trips through the query value', () => {
    expect(new EntityReadinessFilter(['blocked']).toQueryValue()).toEqual([
      'blocked',
    ]);
  });
});
