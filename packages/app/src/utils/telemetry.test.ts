import { getTelemetryPageViewPayload } from './telemetry';
import { Location } from 'react-router';

describe('getTelemetryPageViewPayload', () => {
  const createLocation = (pathname: string): Location => ({
    pathname,
    search: '',
    hash: '',
    state: null,
    key: '',
  });

  it('should return correct payload for catalog index page', () => {
    const location = createLocation('/catalog');
    const result = getTelemetryPageViewPayload(location);
    expect(result).toEqual({
      page: 'Catalog index',
      path: '/catalog',
    });
  });

  it('should return correct payload for catalog entity page', () => {
    const location = createLocation('/catalog/default/component/my-component');
    const result = getTelemetryPageViewPayload(location);
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
    const location = createLocation(
      '/catalog/default/component/my-component/pull-requests',
    );
    const result = getTelemetryPageViewPayload(location);
    expect(result).toEqual({
      page: 'Catalog entity',
      entityNamespace: 'default',
      entityKind: 'component',
      entityName: 'my-component',
      tab: 'pull-requests',
      path: '/catalog/default/component/my-component/pull-requests',
    });
  });

  it('should return correct payload for docs index page', () => {
    const location = createLocation('/docs');
    const result = getTelemetryPageViewPayload(location);
    expect(result).toEqual({
      page: 'Docs index',
      path: '/docs',
    });
  });

  it('should return correct payload for docs entity page', () => {
    const location = createLocation('/docs/default/component/my-component');
    const result = getTelemetryPageViewPayload(location);
    expect(result).toEqual({
      page: 'Docs entity',
      entityNamespace: 'default',
      entityKind: 'component',
      entityName: 'my-component',
      path: '/docs/default/component/my-component',
    });
  });

  it('should return correct payload for software templates index page', () => {
    const location = createLocation('/create');
    const result = getTelemetryPageViewPayload(location);
    expect(result).toEqual({
      page: 'Software Templates index',
      path: '/create',
    });
  });

  it('should return correct payload for software template page', () => {
    const location = createLocation('/create/default/template/my-template');
    const result = getTelemetryPageViewPayload(location);
    expect(result).toEqual({
      page: 'Software Template',
      templateNamespace: 'default',
      templateName: 'my-template',
      path: '/create/default/template/my-template',
    });
  });

  it('should return correct payload for settings page', () => {
    const location = createLocation('/settings');
    const result = getTelemetryPageViewPayload(location);
    expect(result).toEqual({
      page: 'Settings',
      path: '/settings',
    });
  });

  it('should return correct payload for settings page with tab', () => {
    const location = createLocation('/settings/feature-flags');
    const result = getTelemetryPageViewPayload(location);
    expect(result).toEqual({
      page: 'Settings',
      path: '/settings/feature-flags',
    });
  });

  it('should return correct payload for installations index page', () => {
    const location = createLocation('/installations');
    const result = getTelemetryPageViewPayload(location);
    expect(result).toEqual({
      page: 'Installations index',
      path: '/installations',
    });
  });

  it('should return correct payload for clusters index page', () => {
    const location = createLocation('/clusters');
    const result = getTelemetryPageViewPayload(location);
    expect(result).toEqual({
      page: 'Clusters index',
      path: '/clusters',
    });
  });

  it('should return correct payload for cluster details page', () => {
    const location = createLocation(
      '/clusters/installation/org-demo/demo-cluster',
    );
    const result = getTelemetryPageViewPayload(location);
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
    const location = createLocation(
      '/clusters/installation/org-demo/demo-cluster/ssh-access',
    );
    const result = getTelemetryPageViewPayload(location);
    expect(result).toEqual({
      page: 'Cluster details',
      installation: 'installation',
      clusterNamespace: 'org-demo',
      clusterName: 'demo-cluster',
      tab: 'ssh-access',
      path: '/clusters/installation/org-demo/demo-cluster/ssh-access',
    });
  });

  it('should return correct payload for search page', () => {
    const location = createLocation('/search');
    const result = getTelemetryPageViewPayload(location);
    expect(result).toEqual({
      page: 'Search',
      path: '/search',
    });
  });

  it('should return Unknown page payload for unknown paths', () => {
    const location = createLocation('/unknown');
    const result = getTelemetryPageViewPayload(location);
    expect(result).toEqual({
      page: 'Unknown page',
      path: '/unknown',
    });
  });
});
