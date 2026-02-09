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
import { ErrorReporterApi } from '@giantswarm/backstage-plugin-error-reporter-react';

export class TelemetryDeckAnalyticsApi implements AnalyticsApi {
  private readonly configApi: ConfigApi;
  private readonly identityApi: IdentityApi;
  private readonly errorReporterApi?: ErrorReporterApi;
  private td: TelemetryDeck | undefined;
  private initPromise: Promise<TelemetryDeck> | undefined;

  private constructor(options: {
    configApi: ConfigApi;
    identityApi: IdentityApi;
    errorReporterApi?: ErrorReporterApi;
  }) {
    this.configApi = options.configApi;
    this.identityApi = options.identityApi;
    this.errorReporterApi = options.errorReporterApi;
  }

  static fromConfig(options: {
    configApi: ConfigApi;
    identityApi: IdentityApi;
    errorReporterApi?: ErrorReporterApi;
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

    if (payload.page === 'Unknown page') {
      this.errorReporterApi?.notify(`Untracked page view: ${pathname}`, {
        level: 'warning',
        type: 'untracked_page_view',
        path: pathname,
      });
    }

    this.getOrCreateInstance()
      .then(td => td.signal('pageview', payload))
      .catch(() => {});
  }
}
