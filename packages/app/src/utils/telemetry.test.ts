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
});
