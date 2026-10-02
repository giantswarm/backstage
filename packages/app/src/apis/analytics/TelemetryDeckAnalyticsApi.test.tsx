import { ConfigApi, IdentityApi } from '@backstage/core-plugin-api';
import {
  analyticsApiRef,
  createRouteRef,
} from '@backstage/frontend-plugin-api';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  portalEvents,
  type PortalEventSpec,
} from '@giantswarm/backstage-plugin-analytics-react';
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
    getOptionalString: jest.fn().mockReturnValue(undefined),
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
    jest.mocked(configApi.getOptionalString).mockReturnValue(undefined);
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

  it('adds the release version to the pageview signal when configured', async () => {
    jest
      .mocked(configApi.getOptionalString)
      .mockImplementation(key =>
        key === 'app.releaseVersion' ? '2.81.5' : undefined,
      );

    navigateInTestApp('/clusters', { registerRoute: true });
    await flushPromises();

    expect(mockSignal).toHaveBeenCalledWith('pageview', {
      page: 'Clusters index',
      path: '/clusters',
      'TelemetryDeck.AppInfo.version': '2.81.5',
    });
  });

  describe('actions', () => {
    const context = {
      pluginId: 'agent-platform',
      extensionId: 'page:agent-platform',
    };

    function captureAction(
      action: string,
      attributes?: Record<string, string | boolean | number>,
    ) {
      createApi().captureEvent({
        action,
        subject: action,
        attributes,
        context,
      });
    }

    it.each(
      Object.entries(portalEvents as Record<string, PortalEventSpec>).flatMap(
        ([name, { attributes }]) =>
          Object.entries(attributes).flatMap(([key, values]) =>
            values.map(value => {
              // Every other attribute at its first value, this one at each.
              const all = Object.fromEntries(
                Object.entries(attributes).map(([k, v]) => [k, v[0]]),
              );
              return [name, { ...all, [key]: value }] as const;
            }),
          ),
      ),
    )('forwards %s %j as its own signal', async (name, attributes) => {
      captureAction(name, attributes);
      await flushPromises();

      expect(mockSignal).toHaveBeenCalledWith(name, attributes);
      expect(errorReporterApi.notify).not.toHaveBeenCalled();
    });

    it('adds the release version to an action signal when configured', async () => {
      jest
        .mocked(configApi.getOptionalString)
        .mockImplementation(key =>
          key === 'app.releaseVersion' ? '2.81.5' : undefined,
        );

      captureAction('AgentPlatform.agentCreated', { mode: 'deploy' });
      await flushPromises();

      expect(mockSignal).toHaveBeenCalledWith('AgentPlatform.agentCreated', {
        mode: 'deploy',
        'TelemetryDeck.AppInfo.version': '2.81.5',
      });
    });

    it.each([
      ['an action not on the list', 'AgentPlatform.agentDeleted', {}],
      [
        'an attribute outside its set',
        'Muster.mcpServerAdded',
        { authMode: 'https://mcp.example.com' },
      ],
    ])('drops %s and reports it to Sentry', async (_, action, attributes) => {
      captureAction(action, attributes);
      await flushPromises();

      expect(mockSignal).not.toHaveBeenCalled();
      expect(errorReporterApi.notify).toHaveBeenCalledWith(
        `Untracked action: ${action}`,
        {
          level: 'warning',
          type: 'untracked_action',
          action,
          pluginId: 'agent-platform',
        },
      );
    });

    it.each(['click', 'create', 'search', 'discover'])(
      "drops Backstage's built-in %s event silently",
      async action => {
        captureAction(action, { term: 'free text' });
        await flushPromises();

        expect(errorReporterApi.notify).not.toHaveBeenCalled();
        expect(mockSignal).not.toHaveBeenCalled();
      },
    );
  });
});
