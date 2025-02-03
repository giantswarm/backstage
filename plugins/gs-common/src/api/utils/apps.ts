import { Constants, Labels } from '../constants';
import type { App, Catalog } from '../types';
import * as giantswarmApplication from '../../model/giantswarm-application';

export function getAppNames() {
  return giantswarmApplication.AppNames;
}

export function getAppGVK(apiVersion?: string) {
  const gvk = giantswarmApplication.getAppGVK(apiVersion);
  const kind = giantswarmApplication.AppKind;

  if (!gvk) {
    throw new Error(
      `${apiVersion} API version is not supported for ${kind} resource.`,
    );
  }

  return gvk;
}

export const labelAppOperator = 'app-operator.giantswarm.io/version';
export const labelAppName = 'app.kubernetes.io/name';
export const labelAppVersion = 'app.kubernetes.io/version';
export const labelAppCatalog = 'application.giantswarm.io/catalog';
export const labelManagedBy = 'giantswarm.io/managed-by';
export const labelLatest = 'latest';
export const labelCatalogVisibility =
  'application.giantswarm.io/catalog-visibility';
export const labelCatalogType = 'application.giantswarm.io/catalog-type';

export const AppStatuses = {
  Unknown: 'unknown',
  Deployed: 'deployed',
  Uninstalled: 'uninstalled',
  Superseded: 'superseded',
  Failed: 'failed',
  Uninstalling: 'uninstalling',
  PendingInstall: 'pending-install',
  PendingUpgrade: 'pending-upgrade',
  PendingRollback: 'pending-rollback',
} as const;

export const annotationReadme = 'application.giantswarm.io/readme';
export const annotationValuesSchema = 'application.giantswarm.io/values-schema';
export const annotationAppType = 'application.giantswarm.io/app-type';
export const annotationLogo = 'ui.giantswarm.io/logo';

export function isAppCatalogPublic(catalog: Catalog) {
  const visibility = catalog.metadata.labels?.[labelCatalogVisibility];

  return visibility === 'public';
}

export function isAppCatalogStable(catalog: Catalog) {
  const type = catalog.metadata.labels?.[labelCatalogType];

  return type === 'stable';
}

export function getAppCurrentVersion(app: App) {
  return app.status?.version;
}

export function getAppVersion(app: App) {
  return app.spec?.version;
}

export function getAppUpstreamVersion(app: App) {
  if (!app.status || !app.status.appVersion) return '';

  return app.status.appVersion;
}

export function getAppStatus(app: App) {
  return app.status?.release.status;
}

function isAppTargetClusterManagementCluster(app: App) {
  return app.spec?.kubeConfig.inCluster === true;
}

export function getAppTargetClusterName(app: App, installationName: string) {
  if (isAppTargetClusterManagementCluster(app)) {
    return installationName;
  }

  return app.metadata.labels?.[Labels.labelCluster];
}

export function getAppTargetClusterNamespace(app: App) {
  if (isAppTargetClusterManagementCluster(app)) {
    return Constants.MANAGEMENT_CLUSTER_NAMESPACE;
  }

  return app.metadata.namespace;
}

export function getAppChartName(app: App) {
  return app.spec?.name;
}

export function isAppManagedByFlux(app: App) {
  return app.metadata.labels?.[labelManagedBy] === 'flux';
}

export function getAppCreatedTimestamp(app: App) {
  return app.metadata.creationTimestamp;
}

export function getAppUpdatedTimestamp(app: App) {
  return app.status?.release.lastDeployed;
}

export function getAppCatalogName(app: App) {
  return app.spec?.catalog;
}
