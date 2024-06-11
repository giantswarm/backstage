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
