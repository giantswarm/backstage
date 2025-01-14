import { configApiRef, useApi } from '@backstage/core-plugin-api';

export const useGrafanaDashboardsLink = (
  installationName: string,
): string | undefined => {
  const config = useApi(configApiRef);
  const baseDomain = config.getOptionalString(
    `gs.installations.${installationName}.baseDomain`,
  );

  if (!baseDomain) {
    return undefined;
  }

  return `https://grafana.${baseDomain}/dashboards`;
};

export const useGrafanaAlertsLink = (
  installationName: string,
): string | undefined => {
  const config = useApi(configApiRef);
  const baseDomain = config.getOptionalString(
    `gs.installations.${installationName}.baseDomain`,
  );

  if (!baseDomain) {
    return undefined;
  }

  return `https://grafana.${baseDomain}/alerting`;
};

export const useWebUILink = (
  installationName: string,
  clusterName: string,
  organizationName: string,
  isManagementCluster: boolean = false,
): string | undefined => {
  const config = useApi(configApiRef);
  const baseDomain = config.getOptionalString(
    `gs.installations.${installationName}.baseDomain`,
  );

  if (!baseDomain) {
    return undefined;
  }

  if (isManagementCluster) {
    return `https://happa.${baseDomain}`;
  }

  return `https://happa.${baseDomain}/organizations/${organizationName}/clusters/${clusterName}`;
};
