import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { Entity } from '@backstage/catalog-model';
import type { CatalogTableRow } from '@backstage/plugin-catalog';
import { columnFactories } from './columns';

function component(
  labels: Record<string, string>,
  annotations: Record<string, string> = {},
): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'my-app', labels, annotations },
  };
}

async function render(
  column: ReturnType<typeof columnFactories.createBuildStatusColumn>,
  entity: Entity,
) {
  const cell = column.render!({ entity } as CatalogTableRow, 'row');
  const { container } = await renderInTestApp(<>{cell}</>);
  return container;
}

describe('build column', () => {
  it('names the failing checks on hover', async () => {
    const container = await render(
      columnFactories.createBuildStatusColumn(),
      component(
        { 'giantswarm.io/build-status': 'failing' },
        {
          'giantswarm.io/build-failing-checks': JSON.stringify([
            'ci/circleci: build',
            'lint',
          ]),
        },
      ),
    );

    expect(container.textContent).toContain('Failing');
    expect(container.querySelector('[title]')?.getAttribute('title')).toBe(
      'ci/circleci: build, lint',
    );
  });

  it('explains an unknown verdict rather than leaving a bare chip', async () => {
    const container = await render(
      columnFactories.createBuildStatusColumn(),
      component({ 'giantswarm.io/build-status': 'unknown' }),
    );

    expect(container.querySelector('[title]')?.getAttribute('title')).toMatch(
      /Could not be determined/,
    );
  });

  it('sorts failing before unknown before passing', () => {
    const column = columnFactories.createBuildStatusColumn();
    const sort = column.customSort!;
    const row = (status: string) =>
      ({ entity: component({ 'giantswarm.io/build-status': status }) }) as any;

    expect(sort(row('failing'), row('unknown'), 'row')).toBeLessThan(0);
    expect(sort(row('unknown'), row('passing'), 'row')).toBeLessThan(0);
  });
});

describe('build toolchain column', () => {
  it('shows the orb version with the pinned tools on hover', async () => {
    const container = await render(
      columnFactories.createBuildToolchainColumn(),
      component({
        'giantswarm.io/architect-orb-version': '10.3.0',
        'giantswarm.io/app-build-suite-version': '2.3.0',
        'giantswarm.io/app-test-suite-version': '0.15.0',
      }),
    );

    expect(container.textContent).toBe('10.3.0');
    expect(container.querySelector('[title]')?.getAttribute('title')).toBe(
      'architect orb 10.3.0\napp-build-suite 2.3.0\napp-test-suite 0.15.0',
    );
  });

  it('shows a non-release pin as the raw ref', async () => {
    const container = await render(
      columnFactories.createBuildToolchainColumn(),
      component({}, { 'giantswarm.io/architect-orb-ref': 'dev:abc123' }),
    );

    expect(container.textContent).toBe('dev:abc123');
  });

  it('is titled like the sidebar facet', () => {
    expect(columnFactories.createBuildToolchainColumn().title).toBe(
      'Architect Orb Version',
    );
  });

  describe('sorting', () => {
    const sort = columnFactories.createBuildToolchainColumn().customSort!;
    const release = (v: string) => ({
      entity: component({ 'giantswarm.io/architect-orb-version': v }),
    });
    const rows = [
      { entity: component({}) },
      release('10.2.0'),
      { entity: component({}, { 'giantswarm.io/architect-orb-ref': 'dev:a' }) },
      release('9.6.0'),
      release('10.10.0'),
    ] as CatalogTableRow[];
    const orbs = (sorted: CatalogTableRow[]) =>
      sorted.map(
        ({ entity }) =>
          entity.metadata.labels?.['giantswarm.io/architect-orb-version'] ??
          entity.metadata.annotations?.['giantswarm.io/architect-orb-ref'] ??
          '',
      );

    // material-table sorts ascending on the first click, and descending by
    // swapping the comparator's arguments.
    it('puts the newest orb first and rows without one last', () => {
      expect(orbs([...rows].sort((a, b) => sort(a, b, 'row')))).toEqual([
        '10.10.0',
        '10.2.0',
        '9.6.0',
        'dev:a',
        '',
      ]);
    });

    it('reverses exactly on the second click', () => {
      expect(orbs([...rows].sort((a, b) => sort(b, a, 'row')))).toEqual([
        '',
        'dev:a',
        '9.6.0',
        '10.2.0',
        '10.10.0',
      ]);
    });
  });
});
