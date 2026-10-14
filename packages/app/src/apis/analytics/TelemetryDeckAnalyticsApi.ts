import { ConfigApi, IdentityApi } from '@backstage/core-plugin-api';
import { AnalyticsApi, AnalyticsEvent } from '@backstage/frontend-plugin-api';
import TelemetryDeck from '@telemetrydeck/sdk';
import {
  getGuestUserEntityRef,
  getTelemetryPageViewPayload,
} from '../../utils/telemetry';
import { ErrorReporterApi } from '@giantswarm/backstage-plugin-error-reporter-react';
import {
  isPortalEventShaped,
  toPortalEvent,
} from '@giantswarm/backstage-plugin-analytics-react';

export class TelemetryDeckAnalyticsApi implements AnalyticsApi {
  private readonly configApi: ConfigApi;
  private readonly identityApi: IdentityApi;
  private readonly errorReporterApi?: ErrorReporterApi;
  private readonly versionPayload: Record<string, string>;
  private instance: Promise<TelemetryDeck | undefined> | undefined;

  private constructor(options: {
    configApi: ConfigApi;
    identityApi: IdentityApi;
    errorReporterApi?: ErrorReporterApi;
  }) {
    this.configApi = options.configApi;
    this.identityApi = options.identityApi;
    this.errorReporterApi = options.errorReporterApi;
    // TelemetryDeck's default parameter for the app version; the JS SDK
    // does not set it.
    const releaseVersion =
      options.configApi.getOptionalString('app.releaseVersion');
    this.versionPayload = releaseVersion
      ? { 'TelemetryDeck.AppInfo.version': releaseVersion }
      : {};
  }

  static fromConfig(options: {
    configApi: ConfigApi;
    identityApi: IdentityApi;
    errorReporterApi?: ErrorReporterApi;
  }): TelemetryDeckAnalyticsApi {
    return new TelemetryDeckAnalyticsApi(options);
  }

  /**
   * The TelemetryDeck client, created once. Resolves to undefined, after one
   * console message, when telemetry has no app ID or initialisation fails:
   * signals are then skipped, never sent to a client that cannot exist.
   */
  private getInstance(): Promise<TelemetryDeck | undefined> {
    this.instance ??= this.createInstance().catch(error => {
      // eslint-disable-next-line no-console
      console.error(
        'TelemetryDeck initialisation failed, usage data is not sent:',
        error,
      );
      return undefined;
    });
    return this.instance;
  }

  private async createInstance(): Promise<TelemetryDeck | undefined> {
    const telemetryConfig =
      this.configApi.getOptionalConfig('app.telemetrydeck');
    const testMode =
      window.location.hostname === 'localhost' || !telemetryConfig;

    // Not getOptionalString: the config reader refuses an empty string, the
    // base config's value.
    const appID = telemetryConfig
      ? telemetryConfig.getOptional('appID')
      : 'test';
    if (typeof appID !== 'string' || !appID.trim()) {
      // eslint-disable-next-line no-console
      console.warn(
        'TelemetryDeck usage data is disabled: app.telemetrydeck.appID is empty.',
      );
      return undefined;
    }

    const clientUser = await this.resolveClientUser();

    return new TelemetryDeck({
      appID,
      salt: telemetryConfig ? telemetryConfig.getString('salt') : 'test',
      clientUser,
      testMode,
    });
  }

  private async resolveClientUser(): Promise<string> {
    try {
      const identity = await this.identityApi.getBackstageIdentity();

      if (identity.userEntityRef === 'user:default/guest') {
        const profile = await this.identityApi.getProfileInfo();
        return getGuestUserEntityRef(profile);
      }

      return identity.userEntityRef;
    } catch {
      return 'anonymous';
    }
  }

  /**
   * Whether the navigation matched a route registered in the app.
   *
   * The app's RouteTracker resolves each navigation against the registered
   * routes and stores the owning plugin/extension in the analytics context.
   * When nothing matches (e.g. internet bots probing for /wp-login.php and
   * similar paths on the public URL), the RouteTracker contributes no
   * attributes and the navigate event inherits the AppRoot extension
   * boundary's context values: pluginId 'app' and extensionId 'app/root'.
   * This contract is pinned by the integration test in
   * TelemetryDeckAnalyticsApi.test.tsx, which captures events emitted by
   * the real RouteTracker.
   */
  private static isRegisteredRoute(event: AnalyticsEvent): boolean {
    const { pluginId, extensionId } = event.context;
    return pluginId !== 'app' || extensionId !== 'app/root';
  }

  captureEvent(event: AnalyticsEvent): void {
    if (event.action === 'navigate') {
      this.capturePageView(event);
      return;
    }
    this.captureAction(event);
  }

  /**
   * A tracked action from our plugins (`portalEvents`), forwarded as a signal
   * named after it. One named like ours but not on the list, or carrying an
   * attribute outside its set, is a plugin bug: dropped, so no free text can
   * leave the portal, and reported to Sentry. Backstage's built-in actions
   * (`click`, `create`, `search`, `discover`) are dropped silently.
   */
  private captureAction(event: AnalyticsEvent): void {
    const portalEvent = toPortalEvent(event.action, event.attributes);
    if (!portalEvent) {
      if (isPortalEventShaped(event.action)) {
        this.errorReporterApi?.notify(`Untracked action: ${event.action}`, {
          level: 'warning',
          type: 'untracked_action',
          action: event.action,
          pluginId: event.context.pluginId,
        });
      }
      return;
    }

    this.getInstance()
      .then(td =>
        td?.signal(portalEvent.name, {
          ...portalEvent.attributes,
          ...this.versionPayload,
        }),
      )
      // A failed send (offline, blocked by the browser) is not an error.
      .catch(() => {});
  }

  private capturePageView(event: AnalyticsEvent): void {
    if (!event.subject) {
      return;
    }

    const pathname = event.subject.split('?')[0].split('#')[0];
    const payload = getTelemetryPageViewPayload(pathname);

    if (
      payload.page === 'Unknown page' &&
      TelemetryDeckAnalyticsApi.isRegisteredRoute(event)
    ) {
      // Only report untracked page views for paths that resolved to a real
      // app route. Unmatched paths land on the "Not Found" page and are
      // mostly bot/scanner probes — reporting them creates Sentry noise.
      this.errorReporterApi?.notify(`Untracked page view: ${pathname}`, {
        level: 'warning',
        type: 'untracked_page_view',
        path: pathname,
      });
    }

    this.getInstance()
      .then(td =>
        td?.signal('pageview', { ...payload, ...this.versionPayload }),
      )
      // A failed send (offline, blocked by the browser) is not an error.
      .catch(() => {});
  }
}
