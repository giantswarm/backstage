import { configApiRef, useApi } from '@backstage/core-plugin-api';

const typedUrl = (
  baseUrl: string,
  clusterName: string,
  name: string,
  namespace: string,
  type: string,
): string => {
  const queryStringData = {
    clusterName: clusterName,
    name: name,
    namespace: namespace,
  };

  const searchParams = new URLSearchParams(queryStringData);

  return `${baseUrl.replace(
    /\/$/,
    '',
  )}/${type}/details?${searchParams.toString()}`;
};

export const useGitOpsUIDeepLink = (
  installationName: string,
  clusterName: string,
  kind: string,
  name: string,
  namespace: string,
): string | undefined => {
  const config = useApi(configApiRef);
  const baseUrl = config.getOptionalString(
    `gs.installations.${installationName}.gitopsUrl`,
  );

  if (!baseUrl) {
    return undefined;
  }

  switch (kind) {
    case 'helmrelease':
      return typedUrl(baseUrl, clusterName, name, namespace, 'helm_release');
    case 'gitrepository':
      return typedUrl(baseUrl, clusterName, name, namespace, 'git_repo');
    case 'ocirepository':
      return typedUrl(baseUrl, clusterName, name, namespace, 'oci');
    case 'kustomization':
      return typedUrl(baseUrl, clusterName, name, namespace, 'kustomization');
    case 'helmrepository':
      return typedUrl(baseUrl, clusterName, name, namespace, 'helm_repo');
    case 'imagepolicy':
      return typedUrl(baseUrl, clusterName, name, namespace, 'image_policy');
    default:
      return undefined;
  }
};
