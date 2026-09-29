import { useSignedInConfig } from '@giantswarm/backstage-plugin-gs-react';

type K8sVersions = {
  [minorVersion: string]: {
    eolDate: string;
    minorVersion: string;
  };
};

/**
 * The end-of-life date of a Kubernetes version's minor line from
 * `gs.kubernetesVersions` in the signed-in config; null when unknown.
 */
export function useK8sVersionEOLDate(version?: string) {
  const { config } = useSignedInConfig();
  const k8sVersions = config?.getOptional<K8sVersions>('gs.kubernetesVersions');
  if (!k8sVersions || !version) return null;

  const versionParts = version.split('.');
  if (versionParts.length < 2) return null;
  const minor = `${versionParts[0]}.${versionParts[1]}`;

  const versionInfo = k8sVersions[minor];
  if (!versionInfo) return null;

  return versionInfo.eolDate;
}
