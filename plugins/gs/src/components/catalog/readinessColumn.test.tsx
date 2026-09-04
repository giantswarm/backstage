import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { Entity } from '@backstage/catalog-model';
import type { CatalogTableRow } from '@backstage/plugin-catalog';
import { columnFactories } from './columns';

/** Renders the readiness cell for one entity and returns its hover title. */
async function cellTitle(
  labels: Record<string, string>,
  annotations: Record<string, string> = {},
) {
  const entity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'my-app', labels, annotations },
  };
  const column = columnFactories.createReadinessColumn();
  const cell = column.render!({ entity } as CatalogTableRow, 'row');

  const { container } = await renderInTestApp(<>{cell}</>);

  return container.querySelector('[title]')?.getAttribute('title');
}

describe('readiness column', () => {
  it('explains an unknown verdict on hover rather than leaving a bare chip', async () => {
    // verdict() returns no flags on any unknown path, and unknown is the
    // verdict a reader can least interpret unaided.
    const title = await cellTitle({ 'giantswarm.io/readiness': 'unknown' });

    expect(title).toMatch(/Could not be determined/);
  });

  it('explains a releasable verdict on hover', async () => {
    const title = await cellTitle({ 'giantswarm.io/readiness': 'releasable' });

    expect(title).toMatch(/present in the chart registry/);
  });

  it('names the release blockers when there are any', async () => {
    const title = await cellTitle(
      { 'giantswarm.io/readiness': 'blocked' },
      { 'giantswarm.io/readiness-flags': 'NEVER-PUBLISHED' },
    );

    expect(title).toBe('NEVER-PUBLISHED');
  });

  it('keeps chart metadata out of a release-readiness tooltip', async () => {
    const title = await cellTitle(
      { 'giantswarm.io/readiness': 'releasable' },
      {
        'giantswarm.io/readiness-flags': 'NO-VALUES-SCHEMA',
        'giantswarm.io/readiness-advisory': 'CHART-NO-KEYWORDS,META-NO-MANAGED',
      },
    );

    expect(title).not.toMatch(/NO-VALUES-SCHEMA/);
    expect(title).not.toMatch(/CHART-NO-KEYWORDS/);
    expect(title).toMatch(/present in the chart registry/);
  });
});
