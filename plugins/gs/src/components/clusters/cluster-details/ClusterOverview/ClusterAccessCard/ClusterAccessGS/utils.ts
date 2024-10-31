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
