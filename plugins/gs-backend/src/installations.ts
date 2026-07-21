import { RootConfigService } from '@backstage/backend-plugin-api';

/**
 * Configuration of a single Giant Swarm installation, as returned by the
 * authenticated `GET /api/gs/installations` endpoint.
 */
export type InstallationConfig = {
  pipeline?: string;
  providers?: string[];
  authProvider?: string;
  oidcTokenProvider?: string;
  clusterTokenAudience?: string;
  backendUrl?: string;
  baseDomain?: string;
  region?: string;
  apiVersionOverrides?: { [pluralKind: string]: string };
};

export type InstallationsConfig = {
  [installationName: string]: InstallationConfig;
};

/**
 * Reads the full `gs.installations` map from app-config. The backend has
 * unrestricted access to config regardless of frontend visibility, so this
 * returns every field for every installation.
 */
export function readInstallationsConfig(
  config: RootConfigService,
): InstallationsConfig {
  const installationsConfig = config.getOptionalConfig('gs.installations');
  if (!installationsConfig) {
    return {};
  }

  const result: InstallationsConfig = {};
  for (const installationName of installationsConfig.keys()) {
    const installationConfig = installationsConfig.getConfig(installationName);

    const apiVersionOverridesConfig = installationConfig.getOptionalConfig(
      'apiVersionOverrides',
    );
    const apiVersionOverrides = apiVersionOverridesConfig
      ? Object.fromEntries(
          apiVersionOverridesConfig
            .keys()
            .map(key => [key, apiVersionOverridesConfig.getString(key)]),
        )
      : undefined;

    result[installationName] = {
      pipeline: installationConfig.getOptionalString('pipeline'),
      providers: installationConfig.getOptionalStringArray('providers'),
      authProvider: installationConfig.getOptionalString('authProvider'),
      oidcTokenProvider:
        installationConfig.getOptionalString('oidcTokenProvider'),
      clusterTokenAudience: installationConfig.getOptionalString(
        'clusterTokenAudience',
      ),
      backendUrl: installationConfig.getOptionalString('backendUrl'),
      baseDomain: installationConfig.getOptionalString('baseDomain'),
      region: installationConfig.getOptionalString('region'),
      apiVersionOverrides,
    };
  }

  return result;
}
