import { getTelemetryPageViewPayload } from './telemetry';

describe('getTelemetryPageViewPayload', () => {
  it('should return correct payload for home page', () => {
    const result = getTelemetryPageViewPayload('/');
    expect(result).toEqual({
      page: 'Home',
      path: '/',
    });
  });

  it('should return correct payload for catalog index page', () => {
    const result = getTelemetryPageViewPayload('/catalog');
    expect(result).toEqual({
      page: 'Catalog index',
      path: '/catalog',
    });
  });

  it('should return correct payload for catalog entity page', () => {
    const result = getTelemetryPageViewPayload(
      '/catalog/default/component/my-component',
    );
    expect(result).toEqual({
      page: 'Catalog entity',
      entityNamespace: 'default',
      entityKind: 'component',
      entityName: 'my-component',
      tab: 'overview',
      path: '/catalog/default/component/my-component',
    });
  });

  it('should return correct payload for catalog entity page with tab', () => {
    const result = getTelemetryPageViewPayload(
      '/catalog/default/component/my-component/pull-requests',
    );
    expect(result).toEqual({
      page: 'Catalog entity',
      entityNamespace: 'default',
      entityKind: 'component',
      entityName: 'my-component',
      tab: 'pull-requests',
      path: '/catalog/default/component/my-component/pull-requests',
    });
  });

  it('should return correct payload for catalog graph page', () => {
    const result = getTelemetryPageViewPayload('/catalog-graph');
    expect(result).toEqual({
      page: 'Catalog graph',
      path: '/catalog-graph',
    });
  });

  it('should return correct payload for docs index page', () => {
    const result = getTelemetryPageViewPayload('/docs');
    expect(result).toEqual({
      page: 'Docs index',
      path: '/docs',
    });
  });

  it('should return correct payload for docs entity page', () => {
    const result = getTelemetryPageViewPayload(
      '/docs/default/component/my-component',
    );
    expect(result).toEqual({
      page: 'Docs entity',
      entityNamespace: 'default',
      entityKind: 'component',
      entityName: 'my-component',
      path: '/docs/default/component/my-component',
    });
  });

  it('should return correct payload for software templates index page', () => {
    const result = getTelemetryPageViewPayload('/create');
    expect(result).toEqual({
      page: 'Software Templates index',
      path: '/create',
    });
  });

  it('should return correct payload for software template page', () => {
    const result = getTelemetryPageViewPayload(
      '/create/default/template/my-template',
    );
    expect(result).toEqual({
      page: 'Software Template',
      templateNamespace: 'default',
      templateName: 'my-template',
      path: '/create/default/template/my-template',
    });
  });

  it('should return correct payload for settings page', () => {
    const result = getTelemetryPageViewPayload('/settings');
    expect(result).toEqual({
      page: 'Settings',
      path: '/settings',
    });
  });

  it('should return correct payload for settings page with tab', () => {
    const result = getTelemetryPageViewPayload('/settings/feature-flags');
    expect(result).toEqual({
      page: 'Settings',
      path: '/settings/feature-flags',
    });
  });

  it('should return correct payload for installations index page', () => {
    const result = getTelemetryPageViewPayload('/installations');
    expect(result).toEqual({
      page: 'Installations index',
      path: '/installations',
    });
  });

  it('should return correct payload for clusters index page', () => {
    const result = getTelemetryPageViewPayload('/clusters');
    expect(result).toEqual({
      page: 'Clusters index',
      path: '/clusters',
    });
  });

  it('should return correct payload for cluster details page', () => {
    const result = getTelemetryPageViewPayload(
      '/clusters/installation/org-demo/demo-cluster',
    );
    expect(result).toEqual({
      page: 'Cluster details',
      installation: 'installation',
      clusterNamespace: 'org-demo',
      clusterName: 'demo-cluster',
      tab: 'overview',
      path: '/clusters/installation/org-demo/demo-cluster',
    });
  });

  it('should return correct payload for cluster details page with tab', () => {
    const result = getTelemetryPageViewPayload(
      '/clusters/installation/org-demo/demo-cluster/ssh-access',
    );
    expect(result).toEqual({
      page: 'Cluster details',
      installation: 'installation',
      clusterNamespace: 'org-demo',
      clusterName: 'demo-cluster',
      tab: 'ssh-access',
      path: '/clusters/installation/org-demo/demo-cluster/ssh-access',
    });
  });

  it('should return correct payload for deployment details page', () => {
    const result = getTelemetryPageViewPayload(
      '/deployments/gorilla/helmrelease/org-demo/my-app',
    );
    expect(result).toEqual({
      page: 'Deployment details',
      installation: 'gorilla',
      deploymentKind: 'helmrelease',
      deploymentNamespace: 'org-demo',
      deploymentName: 'my-app',
      tab: 'overview',
      path: '/deployments/gorilla/helmrelease/org-demo/my-app',
    });
  });

  it('should return correct payload for deployment details page with tab', () => {
    const result = getTelemetryPageViewPayload(
      '/deployments/gorilla/helmrelease/org-demo/my-app/resources',
    );
    expect(result).toEqual({
      page: 'Deployment details',
      installation: 'gorilla',
      deploymentKind: 'helmrelease',
      deploymentNamespace: 'org-demo',
      deploymentName: 'my-app',
      tab: 'resources',
      path: '/deployments/gorilla/helmrelease/org-demo/my-app/resources',
    });
  });

  it('should return correct payload for flux index page', () => {
    const result = getTelemetryPageViewPayload('/flux');
    expect(result).toEqual({
      page: 'Flux index',
      path: '/flux',
    });
  });

  it('should return correct payload for flux tree view', () => {
    const result = getTelemetryPageViewPayload('/flux/tree');
    expect(result).toEqual({
      page: 'Flux',
      view: 'tree',
      path: '/flux/tree',
    });
  });

  it('should return correct payload for flux list view', () => {
    const result = getTelemetryPageViewPayload('/flux/list');
    expect(result).toEqual({
      page: 'Flux',
      view: 'list',
      path: '/flux/list',
    });
  });

  it('should return correct payload for AI Chat page', () => {
    const result = getTelemetryPageViewPayload('/ai-chat');
    expect(result).toEqual({
      page: 'AI Chat',
      path: '/ai-chat',
    });
  });

  it('should return correct payload for AI Chat history sub-route', () => {
    const result = getTelemetryPageViewPayload('/ai-chat/history');
    expect(result).toEqual({
      page: 'AI Chat',
      view: 'history',
      path: '/ai-chat/history',
    });
  });

  it('should return correct payload for muster index page', () => {
    const result = getTelemetryPageViewPayload('/agent-platform/muster');
    expect(result).toEqual({
      page: 'Muster index',
      path: '/agent-platform/muster',
    });
  });

  it('should return correct payload for muster servers view', () => {
    const result = getTelemetryPageViewPayload(
      '/agent-platform/muster/servers',
    );
    expect(result).toEqual({
      page: 'Muster',
      view: 'servers',
      path: '/agent-platform/muster/servers',
    });
  });

  it('should return correct payload for muster workflows view', () => {
    const result = getTelemetryPageViewPayload(
      '/agent-platform/muster/workflows',
    );
    expect(result).toEqual({
      page: 'Muster',
      view: 'workflows',
      path: '/agent-platform/muster/workflows',
    });
  });

  it('should return correct payload for a muster workflow detail sub-route', () => {
    const result = getTelemetryPageViewPayload(
      '/agent-platform/muster/workflows/my-workflow',
    );
    expect(result).toEqual({
      page: 'Muster',
      view: 'workflows',
      path: '/agent-platform/muster/workflows/my-workflow',
    });
  });

  it('should return correct payload for muster tools view', () => {
    const result = getTelemetryPageViewPayload('/agent-platform/muster/tools');
    expect(result).toEqual({
      page: 'Muster',
      view: 'tools',
      path: '/agent-platform/muster/tools',
    });
  });

  it('should return correct payload for metrics page', () => {
    const result = getTelemetryPageViewPayload('/metrics');
    expect(result).toEqual({
      page: 'Metrics',
      path: '/metrics',
    });
  });

  it('should return correct payload for search page', () => {
    const result = getTelemetryPageViewPayload('/search');
    expect(result).toEqual({
      page: 'Search',
      path: '/search',
    });
  });

  it('should return Unknown page payload for unknown paths', () => {
    const result = getTelemetryPageViewPayload('/unknown');
    expect(result).toEqual({
      page: 'Unknown page',
      path: '/unknown',
    });
  });

  // Guard rail: every registered top-level route must map to a named page.
  // A registered route that falls through to 'Unknown page' is reported to
  // Sentry as an "Untracked page view" warning on every visit (see
  // TelemetryDeckAnalyticsApi.captureEvent). When you add a new page/route,
  // add a case to getTelemetryPageViewPayload and list a representative path
  // here so a forgotten mapping fails CI instead of flooding Sentry.
  describe('all known top-level routes resolve to a named page', () => {
    const knownTopLevelPaths = [
      '/',
      '/catalog',
      '/catalog/default/component/my-component',
      '/catalog-graph',
      '/docs',
      '/docs/default/component/my-component',
      '/create',
      '/create/default/template/my-template',
      '/settings',
      '/installations',
      '/clusters',
      '/clusters/installation/org-demo/demo-cluster',
      '/deployments',
      '/deployments/gorilla/helmrelease/org-demo/my-app',
      '/flux',
      '/flux/tree',
      '/ai-chat',
      '/ai-chat/history',
      '/agent-platform/muster',
      '/agent-platform/muster/dashboard',
      '/agent-platform/muster/servers',
      '/agent-platform/muster/workflows',
      '/agent-platform/muster/workflows/my-workflow',
      '/agent-platform/muster/workflows/my-workflow/run',
      '/agent-platform/muster/tools',
      '/agent-platform',
      '/agent-platform/agents/new',
      '/agent-platform/agents/new/review',
      '/metrics',
      '/search',
    ];

    it.each(knownTopLevelPaths)('%s', pathname => {
      expect(getTelemetryPageViewPayload(pathname).page).not.toBe(
        'Unknown page',
      );
    });
  });
});
