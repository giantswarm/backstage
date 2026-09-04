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

  it('does not title itself after releases when it holds none', async () => {
    // Importer-only is every component today, since the processor ships
    // disabled. The card there is entirely about chart metadata.
    await renderCard({ 'giantswarm.io/readiness-standards': 'incomplete' });

    expect(screen.getByText('Readiness')).toBeInTheDocument();
    expect(screen.queryByText('Release readiness')).not.toBeInTheDocument();
  });

  it('keeps the specific title once there is a release verdict', async () => {
    await renderCard({ 'giantswarm.io/readiness': 'releasable' });

    expect(screen.getByText('Release readiness')).toBeInTheDocument();
  });

  it('shows the card when only the standards label is an empty string', async () => {
    // A presence test: `??` would have stopped at an empty readiness label.
    await renderCard({
      'giantswarm.io/readiness': '',
      'giantswarm.io/readiness-standards': 'incomplete',
    });

    expect(screen.getByText('Incomplete')).toBeInTheDocument();
  });

  it('attributes BUILD-RED to the build, not to the release or the chart', async () => {
    // Releasable, compliant chart, red main: three different answers to three
    // different questions, and the card must not merge them.
    await renderCard(
      {
        'giantswarm.io/readiness': 'releasable',
        'giantswarm.io/readiness-standards': 'ok',
        'giantswarm.io/build-status': 'failing',
      },
      {
        'giantswarm.io/readiness-flags': 'BUILD-RED',
        'giantswarm.io/build-failing-checks': 'ci/circleci: build',
        'giantswarm.io/default-branch': 'main',
      },
    );

    expect(screen.getByText('Releasable')).toBeInTheDocument();
    expect(screen.getByText('Build on main')).toBeInTheDocument();
    expect(screen.getByText('Failing')).toBeInTheDocument();
    expect(screen.getByText('BUILD-RED')).toBeInTheDocument();
    expect(screen.getByText(/ci\/circleci: build/)).toBeInTheDocument();
    expect(screen.queryByText('Blocking the release')).not.toBeInTheDocument();
    expect(screen.queryByText('Fails a build today')).not.toBeInTheDocument();
  });

  it('shows the declared toolchain and says it is declared', async () => {
    await renderCard(
      {
        'giantswarm.io/readiness-standards': 'ok',
        'giantswarm.io/architect-orb-version': '10.3.0',
        'giantswarm.io/app-build-suite-version': '2.3.0',
        'giantswarm.io/app-test-suite-version': '0.15.0',
      },
      { 'giantswarm.io/app-test-suite-version-source': 'repo' },
    );

    expect(screen.getByText('Architect orb')).toBeInTheDocument();
    expect(screen.getByText('10.3.0')).toBeInTheDocument();
    expect(screen.getByText('2.3.0')).toBeInTheDocument();
    expect(screen.getByText('0.15.0 (repo override)')).toBeInTheDocument();
    // No processor ran, so no branch name: the wording still says declared.
    expect(
      screen.getByText(/declared on the default branch/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Build on main')).not.toBeInTheDocument();
  });

  it('shows a non-release orb pin as such', async () => {
    await renderCard(
      { 'giantswarm.io/readiness-standards': 'ok' },
      { 'giantswarm.io/architect-orb-ref': 'dev:abc123' },
    );

    expect(screen.getByText('dev:abc123 (not a release)')).toBeInTheDocument();
  });

  it('renders the card for a build verdict alone', async () => {
    await renderCard(
      { 'giantswarm.io/build-status': 'passing' },
      { 'giantswarm.io/default-branch': 'main' },
    );

    expect(screen.getByText('Build on main')).toBeInTheDocument();
    expect(screen.getByText('Passing')).toBeInTheDocument();
    expect(screen.queryByText('Chart metadata')).not.toBeInTheDocument();
  });
});
