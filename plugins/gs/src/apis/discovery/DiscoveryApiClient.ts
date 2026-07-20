import { UrlPatternDiscovery } from '@backstage/core-app-api';
import { ConfigApi, DiscoveryApi } from '@backstage/core-plugin-api';
import {
  getInstallationsConfig,
  getInstallationsConfigSnapshot,
} from '../installations';

const PLUGINS = ['auth', 'scaffolder', 'kubernetes'];

export class DiscoveryApiClient implements DiscoveryApi {
  private urlPatternDiscovery: UrlPatternDiscovery;

  private static installation: string | null = null;

  constructor(baseUrl: string) {
    this.urlPatternDiscovery = UrlPatternDiscovery.compile(
      `${baseUrl}/api/{{ pluginId }}`,
    );
  }

  async getBaseUrl(pluginId: string, installation?: string) {
    const selectedInstallation =
      installation || DiscoveryApiClient.getInstallation();

    // The default backend URL never depends on installations, so this path must
    // not block on the (post-sign-in) installations fetch -- pre-sign-in auth
    // discovery relies on it. Only a request explicitly scoped to an
    // installation can carry a `backendUrl` override, and by then installations
    // are loaded (post-sign-in); await the source only if it somehow is not.
    if (selectedInstallation && PLUGINS.includes(pluginId)) {
      let overrides = DiscoveryApiClient.getBaseUrlOverrides();
      if (
        getInstallationsConfigSnapshot() === undefined &&
        overrides[selectedInstallation] === undefined
      ) {
        await getInstallationsConfig();
        overrides = DiscoveryApiClient.getBaseUrlOverrides();
      }
      const baseUrlOverride = overrides[selectedInstallation];
      if (baseUrlOverride) {
        const customUrlPatternDiscovery = UrlPatternDiscovery.compile(
          `${baseUrlOverride}/api/{{ pluginId }}`,
        );
        return customUrlPatternDiscovery.getBaseUrl(pluginId);
      }
    }

    return this.urlPatternDiscovery.getBaseUrl(pluginId);
  }

  static fromConfig(configApi: ConfigApi) {
    const baseUrl = configApi.getString('backend.baseUrl');
    return new DiscoveryApiClient(baseUrl);
  }

  /**
   * Builds a matcher for the identity-auth fetch middleware. Evaluated per
   * request so `backendUrl` overrides loaded after app boot are honored without
   * rebuilding the fetch API.
   */
  static createUrlPrefixAllowlistMatcher(
    configApi: ConfigApi,
  ): (url: string) => boolean {
    const baseUrl = configApi.getString('backend.baseUrl').replace(/\/$/, '');
    return (url: string) => {
      const prefixes = [
        baseUrl,
        ...Object.values(DiscoveryApiClient.getBaseUrlOverrides()).map(prefix =>
          prefix.replace(/\/$/, ''),
        ),
      ];
      return prefixes.some(
        prefix => url === prefix || url.startsWith(`${prefix}/`),
      );
    };
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
    return Object.keys(DiscoveryApiClient.getBaseUrlOverrides());
  }

  /**
   * Map of installation name -> `backendUrl` override, derived from the loaded
   * installations snapshot. Empty until installations load.
   */
  static getBaseUrlOverrides(): Record<string, string> {
    const installations = getInstallationsConfigSnapshot() ?? [];
    const baseUrlOverrides: Record<string, string> = {};
    for (const installation of installations) {
      if (installation.backendUrl) {
        baseUrlOverrides[installation.name] = installation.backendUrl;
      }
    }
    return baseUrlOverrides;
  }
}
