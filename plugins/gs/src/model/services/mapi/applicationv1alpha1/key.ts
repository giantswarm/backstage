import { ICatalog } from './';
import { IApp } from './types';

export const labelAppOperator = 'app-operator.giantswarm.io/version';
export const labelAppName = 'app.kubernetes.io/name';
export const labelAppVersion = 'app.kubernetes.io/version';
export const labelAppCatalog = 'application.giantswarm.io/catalog';
export const labelManagedBy = 'giantswarm.io/managed-by';
export const labelLatest = 'latest';
export const labelCatalogVisibility =
  'application.giantswarm.io/catalog-visibility';
export const labelCatalogType = 'application.giantswarm.io/catalog-type';
export const labelCluster = 'giantswarm.io/cluster';

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

export function isAppCatalogPublic(catalog: ICatalog): boolean {
  const visibility = catalog.metadata.labels?.[labelCatalogVisibility];

  return visibility === 'public';
}

export function isAppCatalogStable(catalog: ICatalog): boolean {
  const type = catalog.metadata.labels?.[labelCatalogType];

  return type === 'stable';
}

export function getAppCurrentVersion(app: IApp) {
  return app.status?.version;
}

export function getAppVersion(app: IApp) {
  return app.spec.version;
}

export function getAppUpstreamVersion(app: IApp) {
  if (!app.status || !app.status.appVersion) return '';

  return app.status.appVersion;
}

export function getAppStatus(app: IApp) {
  return app.status?.release.status;
}

export function getAppClusterName(app: IApp) {
  return app.metadata.labels?.[labelCluster];
}

export function getAppChartName(app: IApp) {
  return app.spec.name;
}

export function isAppManagedByFlux(app: IApp): boolean {
  return app.metadata.labels?.[labelManagedBy] === 'flux';
}

export function getAppCreatedTimestamp(app: IApp): string | undefined {
  return app.metadata.creationTimestamp;
}

export function getAppUpdatedTimestamp(app: IApp): string | undefined {
  return app.status?.release.lastDeployed;
}

export function getAppCatalogName(app: IApp): string {
  return app.spec.catalog;
}
