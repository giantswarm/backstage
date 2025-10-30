import { configApiRef, useApi } from '@backstage/core-plugin-api';

export type InstallationInfo = {
  name: string;
  pipeline: string;
  providers: string[];
  baseDomain?: string;
  region?: string;
};

export function useInstallationsInfo() {
  const configApi = useApi(configApiRef);
  const installationsConfig = configApi.getOptionalConfig('gs.installations');
  if (!installationsConfig) {
    throw new Error(`Missing gs.installations configuration`);
  }

  const installations = configApi.getConfig('gs.installations').keys();

  const installationsInfo: InstallationInfo[] = installations.map(
    installation => {
      const installationConfig = installationsConfig.getConfig(installation);
      return {
        name: installation,
        pipeline: installationConfig.getString('pipeline'),
        providers: installationConfig.getOptionalStringArray('providers') ?? [],
        baseDomain: installationConfig.getOptionalString('baseDomain'),
        region: installationConfig.getOptionalString('region'),
      };
    },
  );

  return {
    installationsInfo,
  };
}
