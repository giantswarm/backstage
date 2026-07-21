import { UrlPatternDiscovery } from '@backstage/core-app-api';
import { ConfigApi, DiscoveryApi } from '@backstage/core-plugin-api';
import { getInstallationsConfigSnapshot } from '../installations';

const PLUGINS = ['auth', 'scaffolder', 'kubernetes'];

/**
 * Sentinel passed as the `installation` argument to signal "explicitly no
 * installation -- and do NOT consult the static `getInstallation()` fallback".
 *
 * The main sign-in provider is not installation-scoped, but a per-installation
 * flow may have set the static current installation (e.g.
 * `ScaffolderApiClient.withInstallation` / agent-platform). Passing `undefined`
 * would let that static value leak in and mis-scope a main-provider token
 * refresh to a per-installation backend that carries a `backendUrl` override.
 * The sentinel bypasses both the static fallback and any override.
 */
export const NO_INSTALLATION = Symbol('gs.discovery.no-installation');

export class DiscoveryApiClient implements DiscoveryApi {
  private urlPatternDiscovery: UrlPatternDiscovery;

  private static installation: string | null = null;

  constructor(baseUrl: string) {
    this.urlPatternDiscovery = UrlPatternDiscovery.compile(
      `${baseUrl}/api/{{ pluginId }}`,
    );
  }

  async getBaseUrl(
    pluginId: string,
    installation?: string | typeof NO_INSTALLATION,
  ) {
    // An explicit sentinel means "no installation, and do not fall back to the
    // static current installation". The main sign-in provider uses this so its
    // token refresh is never mis-scoped to a per-installation backend override.
    if (installation === NO_INSTALLATION) {
      return this.urlPatternDiscovery.getBaseUrl(pluginId);
    }

    const selectedInstallation =
      installation || DiscoveryApiClient.getInstallation();

    // The default backend URL never depends on installations, so this path must
    // never block on the (post-sign-in) installations fetch. Pre-sign-in auth
    // discovery relies on it, and the installations loader itself only resolves
    // after sign-in completes -- awaiting the source here would deadlock the
    // boot sequence. Per-installation `backendUrl` overrides are therefore
    // consulted only once the installations snapshot is available (post
    // -sign-in); until then we fall through to the default backend URL.
    if (
      selectedInstallation &&
      PLUGINS.includes(pluginId) &&
      getInstallationsConfigSnapshot() !== undefined
    ) {
      const baseUrlOverride =
        DiscoveryApiClient.getBaseUrlOverrides()[selectedInstallation];
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
