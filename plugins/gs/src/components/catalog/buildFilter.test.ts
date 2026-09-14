import type { Entity } from '@backstage/catalog-model';
import { EntityBuildStatusFilter, EntityOrbVersionFilter } from './filters';

function component(labels: Record<string, string> = {}): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'my-app', labels },
  };
}

describe('EntityBuildStatusFilter', () => {
  it('filters server-side on the label', () => {
    expect(
      new EntityBuildStatusFilter(['failing']).getCatalogFilters(),
    ).toEqual({ 'metadata.labels.giantswarm.io/build-status': ['failing'] });
  });

  it('matches any of the selected verdicts and nothing without one', () => {
    const filter = new EntityBuildStatusFilter(['failing', 'unknown']);
    expect(
      filter.filterEntity(
        component({ 'giantswarm.io/build-status': 'failing' }),
      ),
    ).toBe(true);
    expect(
      filter.filterEntity(
        component({ 'giantswarm.io/build-status': 'passing' }),
      ),
    ).toBe(false);
    expect(filter.filterEntity(component())).toBe(false);
    expect(filter.toQueryValue()).toEqual(['failing', 'unknown']);
  });
});

describe('EntityOrbVersionFilter', () => {
  it('filters server-side on the label', () => {
    expect(new EntityOrbVersionFilter(['9.6.0']).getCatalogFilters()).toEqual({
      'metadata.labels.giantswarm.io/architect-orb-version': ['9.6.0'],
    });
  });

  it('matches the exact versions selected', () => {
    const filter = new EntityOrbVersionFilter(['9.6.0']);
    expect(
      filter.filterEntity(
        component({ 'giantswarm.io/architect-orb-version': '9.6.0' }),
      ),
    ).toBe(true);
    expect(
      filter.filterEntity(
        component({ 'giantswarm.io/architect-orb-version': '10.3.0' }),
      ),
    ).toBe(false);
    expect(filter.toQueryValue()).toEqual(['9.6.0']);
  });
});
