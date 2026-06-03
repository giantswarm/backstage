import { ConfigApi, IdentityApi } from '@backstage/core-plugin-api';
import {
  analyticsApiRef,
  createRouteRef,
} from '@backstage/frontend-plugin-api';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TelemetryDeckAnalyticsApi } from './TelemetryDeckAnalyticsApi';

const mockSignal = jest.fn();

jest.mock('@telemetrydeck/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({ signal: mockSignal })),
}));

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

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

  /**
   * Renders a test app at the given path with the API under test installed
   * as the app's analytics API, so it receives the navigate event emitted
   * by the real RouteTracker — including the real analytics context values
   * for matched and unmatched routes.
   */
  function navigateInTestApp(
    path: string,
    options?: { registerRoute?: boolean },
  ) {
    renderInTestApp(<div />, {
      initialRouteEntries: [path],
      mountedRoutes: options?.registerRoute
        ? { [path]: createRouteRef() }
        : undefined,
      apis: [[analyticsApiRef, createApi()]],
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports untracked page views for paths that matched a registered route', () => {
    navigateInTestApp('/my-test-page', { registerRoute: true });

    expect(errorReporterApi.notify).toHaveBeenCalledWith(
      'Untracked page view: /my-test-page',
      {
        level: 'warning',
        type: 'untracked_page_view',
        path: '/my-test-page',
      },
    );
  });

  it('does not report untracked page views for paths that did not match any route', () => {
    navigateInTestApp('/wp-login.php');

    expect(errorReporterApi.notify).not.toHaveBeenCalled();
  });

  it('does not report tracked page views', () => {
    navigateInTestApp('/clusters', { registerRoute: true });

    expect(errorReporterApi.notify).not.toHaveBeenCalled();
  });

  it('still sends a pageview signal for unmatched paths', async () => {
    navigateInTestApp('/wp-login.php');
    await flushPromises();

    expect(mockSignal).toHaveBeenCalledWith('pageview', {
      page: 'Unknown page',
      path: '/wp-login.php',
    });
  });

  it('sends a pageview signal for tracked pages', async () => {
    navigateInTestApp('/clusters', { registerRoute: true });
    await flushPromises();

    expect(mockSignal).toHaveBeenCalledWith('pageview', {
      page: 'Clusters index',
      path: '/clusters',
    });
  });

  it('ignores events other than navigate', () => {
    createApi().captureEvent({
      action: 'click',
      subject: 'some-button',
      context: {
        pluginId: 'gs',
        extensionId: 'page:gs/clusters',
      },
    });

    expect(errorReporterApi.notify).not.toHaveBeenCalled();
    expect(mockSignal).not.toHaveBeenCalled();
  });
});
