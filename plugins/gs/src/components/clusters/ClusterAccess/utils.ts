export const TSH_INSTALLATION_DOCS_URL =
  'https://goteleport.com/docs/connect-your-client/tsh/#installing-tsh';

export const TSH_LOGIN_COMMAND =
  'tsh login --auth giantswarm --proxy=teleport.giantswarm.io:443 teleport.giantswarm.io';

export function getKubernetesAPIAccessCommand(
  clusterName: string,
  installationName: string,
) {
  if (clusterName === installationName) {
    return `tsh kube login ${clusterName}`;
  }

  return `tsh kube login ${installationName}-${clusterName}`;
}

export function getControlPlaneNodeAccessCommand(
  clusterName: string,
  installationName: string,
) {
  return `tsh ssh root@ins=${installationName},cluster=${clusterName},role=control-plane`;
}

export function getWorkerNodeAccessCommand(
  clusterName: string,
  installationName: string,
) {
  return `tsh ssh root@ins=${installationName},cluster=${clusterName},role=worker`;
}

export function getSpecificNodeAccessCommandExample(installationName: string) {
  return `tsh ssh root@ins=${installationName},node=ip-10-0-85-157`;
}

export function getNodeResourcesURL(
  clusterName: string,
  installationName: string,
) {
  const url = new URL(
    'https://teleport.giantswarm.io/web/cluster/teleport.giantswarm.io/resources',
  );
  url.searchParams.append(
    'query',
    `labels["ins"]=="${installationName}" && labels["cluster"]=="${clusterName}"`,
  );
  url.searchParams.append('kinds', 'node');
  url.searchParams.append('sort', 'name:asc');

  return url.toString();
}
