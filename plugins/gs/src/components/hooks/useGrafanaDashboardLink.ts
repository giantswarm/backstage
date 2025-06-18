import { configApiRef, useApi } from '@backstage/core-plugin-api';

const typedUrl = (
  baseDomain: string,
  dashboard: string,
  clusterName: string,
  namespace: string,
  applicationName: string,
): string => {
  const queryStringData = {
    'var-cluster': clusterName,
    'var-namespace': namespace,
    'var-application': applicationName,
  };

  const searchParams = new URLSearchParams(queryStringData);

  return `https://grafana.${baseDomain}${dashboard}?${searchParams.toString()}`;
};

export const useGrafanaDashboardLink = (
  dashboard: string,
  installationName: string,
  clusterName: string,
  namespace: string,
  applicationName: string,
): string | undefined => {
  const config = useApi(configApiRef);
  const baseDomain = config.getOptionalString(
    `gs.installations.${installationName}.baseDomain`,
  );

  if (!baseDomain) {
    return undefined;
  }

  return typedUrl(
    baseDomain,
    dashboard,
    clusterName,
    namespace,
    applicationName,
  );
};
