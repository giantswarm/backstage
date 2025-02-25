import { configApiRef, useApi } from '@backstage/core-plugin-api';
import { formatTemplateString } from '../utils/formatTemplateString';

export const useGrafanaDashboardLink = (
  installationName: string,
  clusterName: string,
): string | undefined => {
  const config = useApi(configApiRef);
  const baseDomain = config.getOptionalString(
    `gs.installations.${installationName}.baseDomain`,
  );

  if (!baseDomain) {
    return undefined;
  }

  const queryStringData = {
    orgId: '1',
    from: 'now-6h',
    to: 'now',
    timezone: 'browser',
    'var-datasource': 'default',
    'var-cluster': clusterName,
  };

  const searchParams = new URLSearchParams(queryStringData);

  return `https://grafana.${baseDomain}/d/gs_cluster-overview/cluster-overview?${searchParams.toString()}`;
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

export const useGitOpsSourceLink = ({
  url,
  revision,
  path,
}: {
  url?: string;
  revision?: string;
  path?: string;
}) => {
  const config = useApi(configApiRef);
  const urlPatternsConfig = config.getOptionalConfigArray(
    `gs.gitRepositoryUrlPatterns`,
  );

  if (!url || !revision || !path || !urlPatternsConfig) {
    return undefined;
  }

  const data = {
    PATH: path,
    REVISION: revision,
  };

  const urlPatternConfig = urlPatternsConfig.find(configItem => {
    const pattern = configItem.getString('pattern');
    const regexp = new RegExp(pattern);
    return regexp.test(url);
  });

  if (urlPatternConfig) {
    const pattern = urlPatternConfig.getString('pattern');
    const targetUrl = urlPatternConfig.getString('targetUrl');

    const regexp = new RegExp(pattern);
    const matchResult = url.match(regexp);

    if (matchResult && matchResult.groups) {
      const formattedUrl = formatTemplateString(targetUrl, {
        ...data,
        ...matchResult.groups,
      });

      return new URL(formattedUrl).toString();
    }
  }

  return undefined;
};
