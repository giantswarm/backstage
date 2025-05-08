import { UrlPatternDiscovery } from '@backstage/core-app-api';
import { ConfigApi, DiscoveryApi } from '@backstage/core-plugin-api';

const PLUGINS = ['auth', 'scaffolder'];

export class DiscoveryApiClient implements DiscoveryApi {
  private urlPatternDiscovery: UrlPatternDiscovery;

  private static installation: string | null = null;

  constructor(
    baseUrl: string,
    private readonly baseUrlOverrides: Record<string, string> = {},
  ) {
    this.urlPatternDiscovery = UrlPatternDiscovery.compile(
      `${baseUrl}/api/{{ pluginId }}`,
    );
  }

  async getBaseUrl(pluginId: string) {
    const installation = DiscoveryApiClient.getInstallation();
    const baseUrlOverride = installation
      ? this.baseUrlOverrides[installation]
      : undefined;

    if (PLUGINS.includes(pluginId) && baseUrlOverride) {
      const customUrlPatternDiscovery = UrlPatternDiscovery.compile(
        `${baseUrlOverride}/api/{{ pluginId }}`,
      );
      return customUrlPatternDiscovery.getBaseUrl(pluginId);
    }

    return this.urlPatternDiscovery.getBaseUrl(pluginId);
  }

  static fromConfig(configApi: ConfigApi) {
    const baseUrl = configApi.getString('backend.baseUrl');
    const baseUrlOverrides = DiscoveryApiClient.getBaseUrlOverrides(configApi);

    return new DiscoveryApiClient(baseUrl, baseUrlOverrides);
  }

  static getUrlPrefixAllowlist(configApi: ConfigApi) {
    const baseUrl = configApi.getString('backend.baseUrl');
    const baseUrlOverrides = DiscoveryApiClient.getBaseUrlOverrides(configApi);

    return [baseUrl, ...Object.values(baseUrlOverrides)];
  }

  static setInstallation(installation: string) {
    DiscoveryApiClient.installation = installation;
  }

  static getInstallation() {
    return DiscoveryApiClient.installation;
  }

  static resetInstallation() {
    DiscoveryApiClient.installation = null;
  }

  private static getBaseUrlOverrides(
    configApi: ConfigApi,
  ): Record<string, string> {
    const baseUrlOverrides: Record<string, string> = {};
    const installationsConfig = configApi.getOptionalConfig('gs.installations');
    if (installationsConfig) {
      const installationNames = installationsConfig.keys();
      for (const installationName of installationNames) {
        const installationConfig =
          installationsConfig.getConfig(installationName);

        const baseUrlOverride =
          installationConfig.getOptionalString('backendUrl');
        if (baseUrlOverride) {
          baseUrlOverrides[installationName] = baseUrlOverride;
        }
      }
    }

    return baseUrlOverrides;
  }
}
