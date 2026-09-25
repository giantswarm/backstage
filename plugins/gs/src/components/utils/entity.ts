import { ANNOTATION_SOURCE_LOCATION, Entity } from '@backstage/catalog-model';
import { formatVersion } from './helpers';
import { parseChartRef } from '@giantswarm/backstage-plugin-gs-common';

export const GS_ICON_URL = 'giantswarm.io/icon-url';
export const GS_INGRESS_HOST = 'giantswarm.io/ingress-host';
export const GS_GRAFANA_DASHBOARD = 'giantswarm.io/grafana-dashboard';
export const GS_HELMCHART_APP_VERSIONS = 'giantswarm.io/helmchart-app-versions';
export const GS_HELMCHART_VERSIONS = 'giantswarm.io/helmchart-versions';
export const GS_HELMCHARTS = 'giantswarm.io/helmcharts';
export const GS_LATEST_RELEASE_DATE = 'giantswarm.io/latest-release-date';
export const GS_LATEST_RELEASE_TAG = 'giantswarm.io/latest-release-tag';

export const GS_READINESS = 'giantswarm.io/readiness';
export const GS_READINESS_STANDARDS = 'giantswarm.io/readiness-standards';
export const GS_READINESS_FLAGS = 'giantswarm.io/readiness-flags';
export const GS_READINESS_ADVISORY = 'giantswarm.io/readiness-advisory';
export const GS_READINESS_CHECKED = 'giantswarm.io/readiness-checked';
export const GS_CHART_METADATA_STYLE = 'giantswarm.io/chart-metadata-style';
export const GS_BUILD_STATUS = 'giantswarm.io/build-status';
export const GS_BUILD_FAILING_CHECKS = 'giantswarm.io/build-failing-checks';
export const GS_BUILD_STATUS_CHECKED = 'giantswarm.io/build-status-checked';
export const GS_DEFAULT_BRANCH = 'giantswarm.io/default-branch';
export const GS_ARCHITECT_ORB_VERSION = 'giantswarm.io/architect-orb-version';
export const GS_ARCHITECT_ORB_REF = 'giantswarm.io/architect-orb-ref';
export const GS_APP_BUILD_SUITE_VERSION =
  'giantswarm.io/app-build-suite-version';
export const GS_APP_TEST_SUITE_VERSION = 'giantswarm.io/app-test-suite-version';
export const GS_APP_TEST_SUITE_VERSION_SOURCE =
  'giantswarm.io/app-test-suite-version-source';

export const GS_APP_DEPLOYMENT_ACTION = 'giantswarm.io/app-deployment-action';
export const GS_KLAUS_SOUL_URL = 'giantswarm.io/klaus-soul-url';
export const GS_OCI_REPOSITORY = 'giantswarm.io/oci-repository';

export const getSourceLocationFromEntity = (entity: Entity) => {
  const location = entity.metadata.annotations?.[ANNOTATION_SOURCE_LOCATION];

  return location && location.startsWith('url:')
    ? location.replace(/^url:/, '')
    : location;
};

export const getIconUrlFromEntity = (entity: Entity) => {
  return entity.metadata.annotations?.[GS_ICON_URL];
};

export const getIngressHostFromEntity = (entity: Entity) => {
  return entity.metadata.annotations?.[GS_INGRESS_HOST];
};

export const getGrafanaDashboardFromEntity = (entity: Entity) => {
  return entity.metadata.annotations?.[GS_GRAFANA_DASHBOARD];
};

export const isEntityLatestReleaseAvailable = (entity: Entity) =>
  Boolean(entity.metadata.annotations?.[GS_LATEST_RELEASE_TAG]);

export const getLatestReleaseDateFromEntity = (entity: Entity) => {
  const latestReleaseDate =
    entity.metadata.annotations?.[GS_LATEST_RELEASE_DATE];

  return latestReleaseDate;
};

export const getLatestReleaseTagFromEntity = (entity: Entity) => {
  const latestReleaseTag = entity.metadata.annotations?.[GS_LATEST_RELEASE_TAG];

  return latestReleaseTag ? formatVersion(latestReleaseTag) : undefined;
};

/**
 * Whether the release verdict is available. Written by
 * `AppReadinessProcessor`, so it is absent on instances that do not run it —
 * and the processor ships disabled, so today this is false everywhere.
 *
 * This gates the "Release readiness" column, which has nothing to put in a cell
 * without it.
 */
export const isEntityReleaseVerdictAvailable = (entity: Entity) =>
  Boolean(entity.metadata.labels?.[GS_READINESS]);

/**
 * Whether there is any readiness data to show at all.
 *
 * Deliberately broader than the release verdict: most of what the readiness
 * card renders comes from the catalog importer, not from
 * `AppReadinessProcessor`. The importer publishes `readiness-standards`,
 * `readiness-flags`, `readiness-advisory` and `chart-metadata-style` for every
 * component today, so gating the card on the processor's label alone hid a
 * chart's enforced build failures behind a processor nobody has enabled yet.
 *
 * This gates the card, which renders whichever verdicts are present — every
 * block inside it is guarded independently.
 */
export const isEntityReadinessAvailable = (entity: Entity) =>
  Boolean(
    // `||`, not `??`: this is a presence test, and a label set to an empty
    // string would otherwise satisfy `??` and hide the card even when the
    // other label is set.
    entity.metadata.labels?.[GS_READINESS] ||
    entity.metadata.labels?.[GS_READINESS_STANDARDS] ||
    entity.metadata.labels?.[GS_BUILD_STATUS],
  );

export const getReadinessFromEntity = (entity: Entity) =>
  entity.metadata.labels?.[GS_READINESS];

export const getReadinessStandardsFromEntity = (entity: Entity) =>
  entity.metadata.labels?.[GS_READINESS_STANDARDS];

const splitFlags = (raw?: string) =>
  (raw ?? '')
    .split(',')
    .map(flag => flag.trim())
    .filter(Boolean);

/**
 * Gaps that fail a build today. Rendering these as problems is fair.
 */
export const getReadinessFlagsFromEntity = (entity: Entity) =>
  splitFlags(entity.metadata.annotations?.[GS_READINESS_FLAGS]);

/**
 * Gaps documented in the chart metadata standard but gated nowhere. Four charts
 * in five carry at least one, so these describe a rollout that has not happened
 * and must never be rendered as failure.
 */
export const getReadinessAdvisoryFromEntity = (entity: Entity) =>
  splitFlags(entity.metadata.annotations?.[GS_READINESS_ADVISORY]);

export const getReadinessCheckedFromEntity = (entity: Entity) =>
  entity.metadata.annotations?.[GS_READINESS_CHECKED];

export const getChartMetadataStyleFromEntity = (entity: Entity) =>
  entity.metadata.annotations?.[GS_CHART_METADATA_STYLE];

/**
 * Whether `BuildStatusProcessor` has said anything about this component. It
 * ships disabled, like the release processor, and writes nothing at all for a
 * repo that has no CI reporting to its default branch — so this gates the
 * "Build" column on there being a cell to fill.
 */
export const isEntityBuildStatusAvailable = (entity: Entity) =>
  Boolean(entity.metadata.labels?.[GS_BUILD_STATUS]);

export const getBuildStatusFromEntity = (entity: Entity) =>
  entity.metadata.labels?.[GS_BUILD_STATUS];

/** The checks confirmed failing on the default branch. Empty unless failing. */
export const getBuildFailingChecksFromEntity = (entity: Entity) =>
  splitFlags(entity.metadata.annotations?.[GS_BUILD_FAILING_CHECKS]);

export const getBuildStatusCheckedFromEntity = (entity: Entity) =>
  entity.metadata.annotations?.[GS_BUILD_STATUS_CHECKED];

export const getDefaultBranchFromEntity = (entity: Entity) =>
  entity.metadata.annotations?.[GS_DEFAULT_BRANCH];

/**
 * The build toolchain a repo's default branch declares: which architect orb it
 * pins, and the app-build-suite and app-test-suite versions that orb (or the
 * repo, for ATS) pins in turn. Published by the catalog importer from the
 * repo's CircleCI config.
 *
 * "Declares" is the operative word. This is what the default branch *would*
 * build with, not proof of what the last build ran — an orb bump that landed
 * after the last successful build is already reflected here.
 */
export type BuildToolchain = {
  /** Orb version, `v` stripped. Absent when the pin is not a release. */
  orbVersion?: string;
  /** The raw orb ref when it is not a release: `dev:abc123`, `volatile`. */
  orbRef?: string;
  /** app-build-suite version, present only for repos that push a chart. */
  absVersion?: string;
  /** app-test-suite version, present only for repos that run ATS. */
  atsVersion?: string;
  /** `repo` when the repo overrides the orb's ATS default. */
  atsSource?: string;
};

/**
 * Whether the importer found an architect orb in the repo's CI config, as a
 * release pin or otherwise. Gates the "Build toolchain" column.
 */
export const isEntityBuildToolchainAvailable = (entity: Entity) =>
  Boolean(
    entity.metadata.labels?.[GS_ARCHITECT_ORB_VERSION] ||
    entity.metadata.annotations?.[GS_ARCHITECT_ORB_REF],
  );

export const getBuildToolchainFromEntity = (entity: Entity): BuildToolchain => {
  const labels = entity.metadata.labels ?? {};
  const annotations = entity.metadata.annotations ?? {};
  const toolchain: BuildToolchain = {};
  if (labels[GS_ARCHITECT_ORB_VERSION]) {
    toolchain.orbVersion = labels[GS_ARCHITECT_ORB_VERSION];
  }
  if (annotations[GS_ARCHITECT_ORB_REF]) {
    toolchain.orbRef = annotations[GS_ARCHITECT_ORB_REF];
  }
  if (labels[GS_APP_BUILD_SUITE_VERSION]) {
    toolchain.absVersion = labels[GS_APP_BUILD_SUITE_VERSION];
  }
  if (labels[GS_APP_TEST_SUITE_VERSION]) {
    toolchain.atsVersion = labels[GS_APP_TEST_SUITE_VERSION];
  }
  if (annotations[GS_APP_TEST_SUITE_VERSION_SOURCE]) {
    toolchain.atsSource = annotations[GS_APP_TEST_SUITE_VERSION_SOURCE];
  }
  return toolchain;
};

export const isEntityHelmChartsAvailable = (entity: Entity) =>
  Boolean(entity.metadata.annotations?.[GS_HELMCHARTS]);

export const getHelmChartsFromEntity = (entity: Entity) => {
  const helmCharts = entity.metadata.annotations?.[GS_HELMCHARTS];

  return helmCharts?.split(',').map(chartRef => parseChartRef(chartRef)) ?? [];
};

export const getHelmChartsAppVersionsFromEntity = (entity: Entity) => {
  const appVersions = entity.metadata.annotations?.[GS_HELMCHART_APP_VERSIONS];

  return appVersions?.split(',').map(version => formatVersion(version));
};

export const isEntityInstallationResource = (entity: Entity) => {
  return entity.kind === 'Resource' && entity.spec?.type === 'installation';
};

export const isEntityHelmChartTagged = (entity: Entity) => {
  const tags = entity.metadata.tags ?? [];
  return tags.includes('helmchart');
};

export const isEntityKlausPersonality = (entity: Entity) => {
  return (
    entity.kind === 'Component' && entity.spec?.type === 'klaus-personality'
  );
};

export const getKlausSoulUrlFromEntity = (entity: Entity) => {
  return entity.metadata.annotations?.[GS_KLAUS_SOUL_URL];
};

export const getOciRepositoryFromEntity = (entity: Entity) => {
  return entity.metadata.annotations?.[GS_OCI_REPOSITORY];
};

export const isEntityWithOciRepository = (entity: Entity) => {
  return Boolean(getOciRepositoryFromEntity(entity));
};
