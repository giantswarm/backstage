import { configApiRef, useApi } from '@backstage/core-plugin-api';

type K8sVersionsConfig = {
  data: {
    [key: string]: {
      eolDate: string;
      minorVersion: string;
    };
  };
};

export function useK8sVersionEOLDate(version?: string) {
  const configApi = useApi(configApiRef);
  const k8sVersionsConfig = configApi.getOptionalConfig(
    'gs.kubernetesVersions',
  );
  if (!k8sVersionsConfig || !version) return null;

  const k8sVersions = (k8sVersionsConfig as unknown as K8sVersionsConfig).data;

  const versionParts = version.split('.');
  if (versionParts.length < 2) return null;
  const minor = `${versionParts[0]}.${versionParts[1]}`;

  const versionInfo = k8sVersions[minor];
  if (!versionInfo) return null;

  return versionInfo.eolDate;
}
