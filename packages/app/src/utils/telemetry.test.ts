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

  it('should return correct payload for the customize page', () => {
    expect(getTelemetryPageViewPayload('/customize')).toEqual({
      page: 'Customize',
      path: '/customize',
    });
  });

  it.each(['agents', 'skills', 'connectors', 'models', 'workflows'])(
    'reports the %s Customize tab as its view',
    tab => {
      expect(getTelemetryPageViewPayload(`/customize/${tab}`)).toEqual({
        page: 'Customize',
        view: tab,
        path: `/customize/${tab}`,
      });
    },
  );

  it.each(['infrastructure', 'internal'])(
    'reports the Connectors tab’s %s sub-tab as its subview',
    sub => {
      expect(
        getTelemetryPageViewPayload(`/customize/connectors/${sub}`),
      ).toEqual({
        page: 'Customize',
        view: 'connectors',
        subview: sub,
        path: `/customize/connectors/${sub}`,
      });
    },
  );

  it('reports the retired Families path without a subview, as it redirects', () => {
    expect(
      getTelemetryPageViewPayload('/customize/connectors/families'),
    ).toEqual({
      page: 'Customize',
      view: 'connectors',
      path: '/customize/connectors/families',
    });
  });

  it('reports an unknown Customize tab without a view', () => {
    expect(getTelemetryPageViewPayload('/customize/whatever')).toEqual({
      page: 'Customize',
      path: '/customize/whatever',
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

  // Each page of the Agent Platform keeps the page and view names it carried
  // at its old `/agent-platform/…` address, so the numbers stay continuous
  // across the move (giantswarm/giantswarm#38510).
  it.each<[string, Record<string, string>]>([
    ['/sessions', { page: 'Sessions index' }],
    ['/sessions/gazelle/abc123', { page: 'Session detail' }],
    ['/usage', { page: 'Usage', view: 'overview' }],
    ['/usage/cost', { page: 'Usage', view: 'cost' }],
    ['/usage/your-sessions', { page: 'Usage', view: 'conversations' }],
    // The view's path before it took its label, never released: no view.
    ['/usage/conversations', { page: 'Usage', view: 'redirect' }],
    ['/usage/connectors', { page: 'Usage', view: 'connectors' }],
    ['/usage/whatever', { page: 'Usage', view: 'redirect' }],
    ['/profile', { page: 'Profile' }],
    ['/profile/', { page: 'Profile' }],
    ['/profile/whatever', { page: 'Profile' }],
    ['/sessions/', { page: 'Sessions index' }],
    ['/usage/', { page: 'Usage', view: 'overview' }],
    ['/customize/agents/new', { page: 'Agents', view: 'agents/new' }],
    [
      '/customize/agents/new/skills',
      { page: 'Agents', view: 'agents/new/skills' },
    ],
    [
      '/customize/agents/new/review',
      { page: 'Agents', view: 'agents/new/review' },
    ],
    ['/customize/agents/gazelle/kagent/pr-reviewer', { page: 'Agent detail' }],
    [
      '/customize/agents/gazelle/kagent/pr-reviewer/tools',
      { page: 'Agent detail', view: 'tools' },
    ],
    [
      '/customize/agents/gazelle/kagent/pr-reviewer/sessions',
      { page: 'Agent detail', view: 'sessions' },
    ],
    [
      '/customize/agents/gazelle/kagent/pr-reviewer/usage',
      { page: 'Agent detail', view: 'usage' },
    ],
    [
      '/customize/agents/gazelle/kagent/pr-reviewer/skills',
      { page: 'Agent detail', view: 'redirect' },
    ],
    [
      '/customize/agents/gazelle/kagent/pr-reviewer/edit',
      { page: 'Agent edit' },
    ],
    [
      '/customize/agents/gazelle/kagent/pr-reviewer/edit/tools',
      { page: 'Agent edit', view: 'tools' },
    ],
    ['/customize/skills/new', { page: 'Add skill' }],
    [
      '/customize/skills/edit/giantswarm/agent-skills/ticket-triage',
      { page: 'Edit skill' },
    ],
    [
      '/customize/skills/giantswarm/agent-skills/ticket-triage',
      { page: 'Skill detail' },
    ],
    [
      '/customize/skills/giantswarm/agent-skills/ticket-triage/used-by',
      { page: 'Skill detail', view: 'used-by' },
    ],
    [
      '/customize/skills/-/gitea.lab.local/lab/skills/-/ticket-triage',
      { page: 'Skill detail' },
    ],
    [
      '/customize/skills/-/gitea.lab.local/lab/skills/-/ticket-triage/instructions',
      { page: 'Skill detail', view: 'instructions' },
    ],
    [
      '/customize/connectors/new',
      { page: 'Connector registration', view: 'server' },
    ],
    [
      '/customize/connectors/new/auth',
      { page: 'Connector registration', view: 'auth' },
    ],
    [
      '/customize/connectors/gazelle/jira/edit',
      { page: 'Connector registration', view: 'server' },
    ],
    [
      '/customize/connectors/gazelle/jira/edit/verify',
      { page: 'Connector registration', view: 'verify' },
    ],
    [
      '/customize/connectors/gazelle/kubernetes',
      { page: 'Connector', view: 'tools' },
    ],
    [
      '/customize/connectors/gazelle/kubernetes/details',
      { page: 'Connector', view: 'details' },
    ],
    [
      '/customize/connectors/gazelle/kubernetes/whatever',
      { page: 'Connector', view: 'redirect' },
    ],
    // An installation named like a sub-tab: two segments name a connector.
    [
      '/customize/connectors/infrastructure/x',
      { page: 'Connector', view: 'tools' },
    ],
    [
      '/customize/connectors/gazelle/kubernetes/tools/x_kubernetes_get_pods',
      { page: 'Connector tool' },
    ],
    [
      '/customize/workflows/gazelle/deploy',
      { page: 'Workflow', view: 'overview' },
    ],
    [
      '/customize/workflows/gazelle/deploy/run',
      { page: 'Workflow', view: 'run' },
    ],
    [
      '/customize/workflows/gazelle/deploy/x',
      { page: 'Workflow', view: 'redirect' },
    ],
    ['/customize/models/new', { page: 'Models', view: 'new' }],
    ['/customize/models/hosting', { page: 'Models', view: 'serving' }],
    [
      '/customize/models/hosting/capacity',
      { page: 'Models', view: 'capacity' },
    ],
    ['/customize/models/hosting/cache', { page: 'Models', view: 'cache' }],
    ['/customize/models/hosting/x', { page: 'Models', view: 'redirect' }],
    ['/customize/models/hosting/serve', { page: 'Serve model' }],
    ['/customize/models/hosting/import', { page: 'Import model' }],
    ['/customize/models/hosting/pull', { page: 'Pull model' }],
    ['/customize/models/hosting/add-backend', { page: 'Add model backend' }],
    [
      '/customize/models/hosting/capacity/add-pool',
      { page: 'Add GPU node pool' },
    ],
    ['/customize/models/gazelle/kagent/gpt-4o/edit', { page: 'Model edit' }],
  ])('reports %s under its page name', (path, payload) => {
    expect(getTelemetryPageViewPayload(path)).toEqual({ ...payload, path });
  });

  // The old tree only redirects, in one hop; the page the visit lands on
  // reports itself right after, so these neither count as that page nor open
  // a dimension with their segments.
  it.each([
    '/agent-platform',
    '/agent-platform/sessions',
    '/agent-platform/agents/gazelle/kagent/pr-reviewer/tools',
    '/agent-platform/connectors/kubernetes',
    '/agent-platform/mcp-servers/kubernetes',
    '/agent-platform/models/serving',
    '/agent-platform/usage/overview',
    '/agent-platform/profile',
  ])('reports the old address %s as a redirect', path => {
    expect(getTelemetryPageViewPayload(path)).toEqual({
      page: 'Agent Platform redirect',
      path,
    });
  });

  it.each(['/agents', '/agents/new'])(
    'reports the older short path %s as a redirect',
    path => {
      expect(getTelemetryPageViewPayload(path)).toEqual({
        page: 'Agents redirect',
        path,
      });
    },
  );

  it('should return correct payload for plans index page', () => {
    const result = getTelemetryPageViewPayload('/plans');
    expect(result).toEqual({
      page: 'Plans index',
      path: '/plans',
    });
  });

  it('should return correct payload for one plan', () => {
    // No `view`: the only varying segment is a pull request number, so echoing
    // it would emit a page name per plan.
    const result = getTelemetryPageViewPayload('/plans/pr/22');
    expect(result).toEqual({
      page: 'Plan detail',
      path: '/plans/pr/22',
    });
  });

  it('should return correct payload for the product magazine', () => {
    const result = getTelemetryPageViewPayload('/product');
    expect(result).toEqual({
      page: 'Product magazine',
      path: '/product',
    });
  });

  it('should return correct payload for roadmap index page', () => {
    const result = getTelemetryPageViewPayload('/roadmap');
    expect(result).toEqual({
      page: 'Roadmap index',
      path: '/roadmap',
    });
  });

  it('should return correct payload for one roadmap item', () => {
    const result = getTelemetryPageViewPayload('/roadmap/items/PVTI_abc123');
    expect(result).toEqual({
      page: 'Roadmap item',
      path: '/roadmap/items/PVTI_abc123',
    });
  });

  // Seen in Sentry: the item route is navigated to with an empty id while the
  // board is still resolving. It must not fall through to 'Unknown page'.
  it('should return correct payload for the item route with no id', () => {
    const result = getTelemetryPageViewPayload('/roadmap/items/');
    expect(result).toEqual({
      page: 'Roadmap item',
      path: '/roadmap/items/',
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
      '/customize',
      '/customize/agents',
      '/customize/skills',
      '/customize/connectors',
      '/customize/connectors/infrastructure',
      '/customize/connectors/families',
      '/customize/connectors/internal',
      '/customize/models',
      '/customize/models/gazelle/agent-platform/gpt-4o',
      '/customize/models/gazelle/agent-platform/gpt-4o/usage',
      '/customize/models/gazelle/agent-platform/gpt-4o/used-by',
      '/customize/workflows',
      '/customize/workspaces',
      '/customize/agents/new',
      '/customize/agents/new/skills',
      '/customize/agents/new/tools',
      '/customize/agents/new/review',
      '/customize/agents/gazelle/agent-platform/pr-reviewer',
      '/customize/agents/gazelle/agent-platform/pr-reviewer/tools',
      '/customize/agents/gazelle/agent-platform/pr-reviewer/sessions',
      '/customize/agents/gazelle/agent-platform/pr-reviewer/usage',
      '/customize/agents/gazelle/agent-platform/pr-reviewer/edit',
      '/customize/agents/gazelle/agent-platform/pr-reviewer/edit/skills',
      '/customize/agents/gazelle/agent-platform/pr-reviewer/edit/tools',
      '/customize/agents/gazelle/agent-platform/pr-reviewer/edit/review',
      '/customize/skills/new',
      '/customize/skills/edit/giantswarm/agent-skills/ticket-triage',
      '/customize/skills/giantswarm/agent-skills/ticket-triage',
      '/customize/skills/giantswarm/agent-skills/ticket-triage/instructions',
      '/customize/skills/giantswarm/agent-skills/ticket-triage/used-by',
      '/customize/skills/-/gitea.lab.local/lab/skills/-/ticket-triage',
      '/customize/connectors/new',
      '/customize/connectors/new/auth',
      '/customize/connectors/new/verify',
      '/customize/connectors/gazelle/kubernetes',
      '/customize/connectors/gazelle/kubernetes/details',
      '/customize/connectors/gazelle/kubernetes/used-by',
      '/customize/connectors/gazelle/kubernetes/tools/x_kubernetes_get_pods',
      '/customize/connectors/gazelle/jira/edit',
      '/customize/connectors/gazelle/jira/edit/auth',
      '/customize/connectors/gazelle/jira/edit/verify',
      '/customize/workflows/gazelle/my-workflow',
      '/customize/workflows/gazelle/my-workflow/run',
      '/customize/workflows/gazelle/my-workflow/usage',
      '/customize/workflows/gazelle/my-workflow/details',
      '/customize/models/new',
      '/customize/models/gazelle/agent-platform/gpt-4o/edit',
      '/customize/models/hosting',
      '/customize/models/hosting/capacity',
      '/customize/models/hosting/cache',
      '/customize/models/hosting/serve',
      '/customize/models/hosting/import',
      '/customize/models/hosting/pull',
      '/customize/models/hosting/add-backend',
      '/customize/models/hosting/capacity/add-pool',
      '/sessions',
      '/sessions/gazelle/abc123',
      '/usage',
      '/usage/cost',
      '/usage/your-sessions',
      '/usage/connectors',
      '/profile',
      // The old tree, redirect-only until the end of 2026.
      '/agent-platform',
      '/agent-platform/agents/gazelle/agent-platform/pr-reviewer',
      '/agent-platform/connectors/kubernetes',
      '/agents',
      '/agents/new',
      '/installations',
      '/clusters',
      '/clusters/installation/org-demo/demo-cluster',
      '/deployments',
      '/deployments/gorilla/helmrelease/org-demo/my-app',
      '/flux',
      '/flux/tree',
      '/ai-chat',
      '/ai-chat/history',
      // Pre-existing gaps in this list, closed while adding the one above.
      '/plans',
      '/bot-prs',
      '/plans/pr/22',
      '/roadmap',
      '/roadmap/items/PVTI_abc123',
      '/product',
      '/hive',
      '/hive/now',
      '/hive/history',
      '/hive/roadmap',
      '/hive/roadmap/items/PVTI_x',
      '/hive/plans',
      '/hive/plans/pr/22',
      '/hive/knowledge',
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
