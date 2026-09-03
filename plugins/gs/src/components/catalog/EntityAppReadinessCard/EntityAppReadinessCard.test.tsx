import { renderInTestApp } from '@backstage/frontend-test-utils';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import type { Entity } from '@backstage/catalog-model';
import { screen } from '@testing-library/react';
import { EntityAppReadinessCard } from './EntityAppReadinessCard';

function renderCard(
  labels: Record<string, string>,
  annotations: Record<string, string> = {},
) {
  const entity: Entity = {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'my-app', labels, annotations },
  };

  return renderInTestApp(
    <EntityProvider entity={entity}>
      <EntityAppReadinessCard />
    </EntityProvider>,
  );
}

describe('<EntityAppReadinessCard />', () => {
  it('does not present a chart metadata gap as blocking the release', async () => {
    // The concrete contradiction: the newest release IS in the registry, but
    // Chart.yaml has no team annotation. Both verdicts write to
    // readiness-flags, so a merged list said "Releasable" and "Blocking" at
    // once.
    await renderCard(
      {
        'giantswarm.io/readiness': 'releasable',
        'giantswarm.io/readiness-standards': 'incomplete',
      },
      { 'giantswarm.io/readiness-flags': 'META-NO-TEAM' },
    );

    expect(screen.getByText('Releasable')).toBeInTheDocument();
    expect(screen.queryByText('Blocking the release')).not.toBeInTheDocument();
    expect(screen.getByText('Fails a build today')).toBeInTheDocument();
    expect(screen.getByText('META-NO-TEAM')).toBeInTheDocument();
  });

  it('attributes a release blocker to the release', async () => {
    await renderCard(
      { 'giantswarm.io/readiness': 'blocked' },
      { 'giantswarm.io/readiness-flags': 'NEVER-PUBLISHED' },
    );

    expect(screen.getByText('Blocking the release')).toBeInTheDocument();
    expect(screen.getByText('NEVER-PUBLISHED')).toBeInTheDocument();
    expect(screen.queryByText('Fails a build today')).not.toBeInTheDocument();
  });

  it('separates the two lists when a component carries both', async () => {
    await renderCard(
      {
        'giantswarm.io/readiness': 'blocked',
        'giantswarm.io/readiness-standards': 'incomplete',
      },
      {
        'giantswarm.io/readiness-flags': 'NEVER-PUBLISHED,NO-VALUES-SCHEMA',
        'giantswarm.io/readiness-advisory': 'CHART-NO-KEYWORDS',
      },
    );

    expect(screen.getByText('Blocking the release')).toBeInTheDocument();
    expect(screen.getByText('Fails a build today')).toBeInTheDocument();
    expect(screen.getByText('Not enforced')).toBeInTheDocument();
    expect(screen.getByText('NEVER-PUBLISHED')).toBeInTheDocument();
    expect(screen.getByText('NO-VALUES-SCHEMA')).toBeInTheDocument();
    expect(screen.getByText('CHART-NO-KEYWORDS')).toBeInTheDocument();
  });

  it('shows the chart metadata verdict the importer publishes', async () => {
    await renderCard({
      'giantswarm.io/readiness': 'releasable',
      'giantswarm.io/readiness-standards': 'ok',
    });

    expect(screen.getByText('Chart metadata')).toBeInTheDocument();
    expect(screen.getByText('Meets the standard')).toBeInTheDocument();
  });

  it('renders the importer-only case, with no release verdict at all', async () => {
    // What every component looks like today: the importer publishes, the
    // processor is off.
    await renderCard(
      { 'giantswarm.io/readiness-standards': 'incomplete' },
      { 'giantswarm.io/readiness-flags': 'NO-VALUES-SCHEMA' },
    );

    expect(screen.getByText('Incomplete')).toBeInTheDocument();
    expect(screen.getByText('Fails a build today')).toBeInTheDocument();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
    expect(screen.queryByText('Blocking the release')).not.toBeInTheDocument();
  });
});
