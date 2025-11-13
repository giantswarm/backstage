import { UrlPatternDiscovery } from '@backstage/core-app-api';
import { ConfigApi, DiscoveryApi } from '@backstage/core-plugin-api';

const PLUGINS = ['auth', 'scaffolder', 'kubernetes'];

export class DiscoveryApiClient implements DiscoveryApi {
  private urlPatternDiscovery: UrlPatternDiscovery;

  private static installation: string | null = null;
  private static baseUrlOverrides: Record<string, string> = {};
  private static installationsWithBaseUrlOverrides: string[] = [];

  constructor(
    baseUrl: string,
    private readonly baseUrlOverrides: Record<string, string> = {},
  ) {
    this.urlPatternDiscovery = UrlPatternDiscovery.compile(
      `${baseUrl}/api/{{ pluginId }}`,
    );
  }

  async getBaseUrl(pluginId: string, installation?: string) {
    const selectedInstallation =
      installation || DiscoveryApiClient.getInstallation();
    const baseUrlOverride = selectedInstallation
      ? this.baseUrlOverrides[selectedInstallation]
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
    const baseUrlOverrides =
      DiscoveryApiClient.calculateBaseUrlOverrides(configApi);
    DiscoveryApiClient.baseUrlOverrides = baseUrlOverrides;
    DiscoveryApiClient.installationsWithBaseUrlOverrides =
      Object.keys(baseUrlOverrides);

    return new DiscoveryApiClient(baseUrl, baseUrlOverrides);
  }

  static getUrlPrefixAllowlist(configApi: ConfigApi) {
    const baseUrl = configApi.getString('backend.baseUrl');
    const baseUrlOverrides =
      DiscoveryApiClient.calculateBaseUrlOverrides(configApi);

    return [baseUrl, ...Object.values(baseUrlOverrides)];
  }

  static setInstallation(installation: string) {
    if (
      DiscoveryApiClient.installation &&
      DiscoveryApiClient.installation !== installation
    ) {
      throw new Error(
        `Installation ${DiscoveryApiClient.installation} is already set`,
      );
    }

    if (DiscoveryApiClient.installation === installation) {
      return undefined;
    }

    DiscoveryApiClient.installation = installation;

    return () => {
      DiscoveryApiClient.installation = null;
    };
  }

  static getInstallation() {
    return DiscoveryApiClient.installation;
  }

  static getInstallationsWithBaseUrlOverrides() {
    return DiscoveryApiClient.installationsWithBaseUrlOverrides;
  }

  static getBaseUrlOverrides() {
    return DiscoveryApiClient.baseUrlOverrides;
  }

  private static calculateBaseUrlOverrides(
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
