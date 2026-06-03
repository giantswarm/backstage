import {
  AnalyticsEvent,
  ConfigApi,
  IdentityApi,
} from '@backstage/core-plugin-api';
import { TelemetryDeckAnalyticsApi } from './TelemetryDeckAnalyticsApi';

const mockSignal = jest.fn();

jest.mock('@telemetrydeck/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ signal: mockSignal })),
}));

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Builds a 'navigate' event the way the app's RouteTracker emits it: with
 * the owning plugin/extension in the context for matched routes, and the
 * default context values ('app'/'app') for paths that did not match any
 * registered route.
 */
function navigateEvent(
  subject: string,
  context: Record<string, string>,
): AnalyticsEvent {
  return {
    action: 'navigate',
    subject,
    context: context as AnalyticsEvent['context'],
  };
}

describe('TelemetryDeckAnalyticsApi', () => {
  const configApi = {
    getOptionalConfig: jest.fn().mockReturnValue(undefined),
  } as unknown as ConfigApi;

  const identityApi = {
    getBackstageIdentity: jest
      .fn()
      .mockResolvedValue({ userEntityRef: 'user:default/test' }),
    getProfileInfo: jest.fn().mockResolvedValue({}),
  } as unknown as IdentityApi;

  const errorReporterApi = { notify: jest.fn() };

  function createApi() {
    return TelemetryDeckAnalyticsApi.fromConfig({
      configApi,
      identityApi,
      errorReporterApi,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports untracked page views for paths that matched a registered route', () => {
    createApi().captureEvent(
      navigateEvent('/notifications', {
        pluginId: 'notifications',
        extensionId: 'page:notifications',
      }),
    );

    expect(errorReporterApi.notify).toHaveBeenCalledWith(
      'Untracked page view: /notifications',
      {
        level: 'warning',
        type: 'untracked_page_view',
        path: '/notifications',
      },
    );
  });

  it('does not report untracked page views for paths that did not match any route', () => {
    createApi().captureEvent(
      navigateEvent('/wp-login.php', {
        pluginId: 'app',
        extensionId: 'app',
      }),
    );

    expect(errorReporterApi.notify).not.toHaveBeenCalled();
  });

  it('does not report tracked page views', () => {
    createApi().captureEvent(
      navigateEvent('/clusters', {
        pluginId: 'gs',
        extensionId: 'page:gs/clusters',
      }),
    );

    expect(errorReporterApi.notify).not.toHaveBeenCalled();
  });

  it('still sends a pageview signal for unmatched paths', async () => {
    createApi().captureEvent(
      navigateEvent('/wp-login.php', {
        pluginId: 'app',
        extensionId: 'app',
      }),
    );
    await flushPromises();

    expect(mockSignal).toHaveBeenCalledWith('pageview', {
      page: 'Unknown page',
      path: '/wp-login.php',
    });
  });

  it('ignores events other than navigate', () => {
    const context: Record<string, string> = {
      pluginId: 'gs',
      extensionId: 'page:gs/clusters',
    };
    createApi().captureEvent({
      action: 'click',
      subject: 'some-button',
      context: context as AnalyticsEvent['context'],
    });

    expect(errorReporterApi.notify).not.toHaveBeenCalled();
    expect(mockSignal).not.toHaveBeenCalled();
  });
});
