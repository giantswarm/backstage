import { configApiRef, useApi } from '@backstage/core-plugin-api';

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

const GIT_REPOSITORY_URL_VARIANT_1 =
  /^https:\/\/(?<hostname>bitbucket.+?)\/scm\/(?<projectName>.+?)\/(?<repositoryName>.+?)(\.git)?$/;

const GIT_REPOSITORY_URL_VARIANT_2 =
  /^ssh:\/\/git@(?<hostname>gitlab.+?)\/(?<repositoryPath>.+?)(\.git)?$/;

const GIT_REPOSITORY_URL_VARIANT_3 =
  /^ssh:\/\/git@(ssh\.)?(?<hostname>github.+?)(:443)?\/(?<repositoryPath>.+?)(\.git)?$/;

const GIT_REPOSITORY_URL_VARIANT_4 =
  /^https:\/\/(?<hostname>github.+?)\/(?<repositoryPath>.+?)$/;

export const useGitOpsSourceLink = ({
  url,
  revision,
  path,
}: {
  url?: string;
  revision?: string;
  path?: string;
}) => {
  if (!url || !revision || !path) {
    return undefined;
  }

  if (GIT_REPOSITORY_URL_VARIANT_1.test(url)) {
    const matchResult = url.match(GIT_REPOSITORY_URL_VARIANT_1);
    if (
      matchResult &&
      matchResult.groups &&
      matchResult.groups.hostname &&
      matchResult.groups.projectName &&
      matchResult.groups.repositoryName
    ) {
      const { hostname, projectName, repositoryName } = matchResult.groups;

      return new URL(
        `https://${hostname}/projects/${projectName}/repos/${repositoryName}/browse/${path}?at=${revision}`,
      ).toString();
    }
  }

  if (GIT_REPOSITORY_URL_VARIANT_2.test(url)) {
    const matchResult = url.match(GIT_REPOSITORY_URL_VARIANT_2);
    if (
      matchResult &&
      matchResult.groups &&
      matchResult.groups.hostname &&
      matchResult.groups.repositoryPath
    ) {
      const { hostname, repositoryPath } = matchResult.groups;

      return new URL(
        `https://${hostname}/${repositoryPath}/-/tree/${revision}/${path}`,
      ).toString();
    }
  }

  if (GIT_REPOSITORY_URL_VARIANT_3.test(url)) {
    const matchResult = url.match(GIT_REPOSITORY_URL_VARIANT_3);
    if (
      matchResult &&
      matchResult.groups &&
      matchResult.groups.hostname &&
      matchResult.groups.repositoryPath
    ) {
      const { hostname, repositoryPath } = matchResult.groups;

      return new URL(
        `https://${hostname}/${repositoryPath}/blob/${revision}/${path}`,
      ).toString();
    }
  }

  if (GIT_REPOSITORY_URL_VARIANT_4.test(url)) {
    const matchResult = url.match(GIT_REPOSITORY_URL_VARIANT_4);
    if (
      matchResult &&
      matchResult.groups &&
      matchResult.groups.hostname &&
      matchResult.groups.repositoryPath
    ) {
      const { hostname, repositoryPath } = matchResult.groups;

      return new URL(
        `https://${hostname}/${repositoryPath}/blob/${revision}/${path}`,
      ).toString();
    }
  }

  return undefined;
};
