import {
  AnalyticsApi,
  AnalyticsEvent,
  ConfigApi,
  IdentityApi,
} from '@backstage/core-plugin-api';
import TelemetryDeck from '@telemetrydeck/sdk';
import {
  getGuestUserEntityRef,
  getTelemetryPageViewPayload,
} from '../../utils/telemetry';

export class TelemetryDeckAnalyticsApi implements AnalyticsApi {
  private readonly configApi: ConfigApi;
  private readonly identityApi: IdentityApi;
  private td: TelemetryDeck | undefined;
  private initPromise: Promise<TelemetryDeck> | undefined;

  private constructor(options: {
    configApi: ConfigApi;
    identityApi: IdentityApi;
  }) {
    this.configApi = options.configApi;
    this.identityApi = options.identityApi;
  }

  static fromConfig(options: {
    configApi: ConfigApi;
    identityApi: IdentityApi;
  }): TelemetryDeckAnalyticsApi {
    return new TelemetryDeckAnalyticsApi(options);
  }

  private async getOrCreateInstance(): Promise<TelemetryDeck> {
    if (this.td) {
      return this.td;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.createInstance();
    this.td = await this.initPromise;
    return this.td;
  }

  private async createInstance(): Promise<TelemetryDeck> {
    const telemetryConfig =
      this.configApi.getOptionalConfig('app.telemetrydeck');
    const testMode =
      window.location.hostname === 'localhost' || !telemetryConfig;

    const clientUser = await this.resolveClientUser();

    return new TelemetryDeck({
      appID: telemetryConfig ? telemetryConfig.getString('appID') : 'test',
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

  captureEvent(event: AnalyticsEvent): void {
    if (event.action !== 'navigate' || !event.subject) {
      return;
    }

    const pathname = event.subject.split('?')[0].split('#')[0];
    const payload = getTelemetryPageViewPayload(pathname);

    this.getOrCreateInstance()
      .then(td => td.signal('pageview', payload))
      .catch(() => {});
  }
}
