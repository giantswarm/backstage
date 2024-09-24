import { configApiRef, useApi } from '@backstage/core-plugin-api';

const typedUrl = (
  baseUrl: string,
  dashboard: string,
  clusterName: string,
  applicationName: string,
): string => {
  const queryStringData = {
    'var-cluster': clusterName,
    'var-application': applicationName,
  };

  const searchParams = new URLSearchParams(queryStringData);

  return `${baseUrl.replace(
    /\/$/,
    '',
  )}/d/${dashboard}?${searchParams.toString()}`;
};

export const useGrafanaDashboardLink = (
  dashboard: string,
  installationName: string,
  clusterName: string,
  applicationName: string,
): string | undefined => {
  const config = useApi(configApiRef);
  const baseUrl = config.getOptionalString(
    `gs.installations.${installationName}.grafanaUrl`,
  );

  if (!baseUrl) {
    return undefined;
  }

  return typedUrl(baseUrl, dashboard, clusterName, applicationName);
};
