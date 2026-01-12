import { ANNOTATION_SOURCE_LOCATION, Entity } from '@backstage/catalog-model';
import { formatVersion } from './helpers';
import { parseChartRef } from './parseChartRef';

export const GS_DEPLOYMENT_NAMES = 'giantswarm.io/deployment-names';
export const GS_INGRESS_HOST = 'giantswarm.io/ingress-host';
export const GS_GRAFANA_DASHBOARD = 'giantswarm.io/grafana-dashboard';
export const GS_HELMCHART_APP_VERSIONS = 'giantswarm.io/helmchart-app-versions';
export const GS_HELMCHART_VERSIONS = 'giantswarm.io/helmchart-versions';
export const GS_HELMCHARTS = 'giantswarm.io/helmcharts';
export const GS_LATEST_RELEASE_DATE = 'giantswarm.io/latest-release-date';
export const GS_LATEST_RELEASE_TAG = 'giantswarm.io/latest-release-tag';

export const isEntityDeploymentsAvailable = (entity: Entity) =>
  Boolean(entity.metadata.annotations?.[GS_DEPLOYMENT_NAMES]);

export const getDeploymentNamesFromEntity = (entity: Entity) => {
  const deploymentNames = entity.metadata.annotations?.[GS_DEPLOYMENT_NAMES];

  if (!deploymentNames) {
    return undefined;
  }

  return deploymentNames.replace(/\s/g, '').split(',');
};

export const getSourceLocationFromEntity = (entity: Entity) => {
  const location = entity.metadata.annotations?.[ANNOTATION_SOURCE_LOCATION];

  return location && location.startsWith('url:')
    ? location.replace(/^url:/, '')
    : location;
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

export const isEntityKratixResource = (entity: Entity) => {
  return entity.kind === 'Resource' && entity.spec?.type === 'kratix';
};

export const GITHUB_PROJECT_SLUG = 'github.com/project-slug';

export const getGithubProjectSlugFromEntity = (entity: Entity) => {
  return entity.metadata.annotations?.[GITHUB_PROJECT_SLUG];
};
