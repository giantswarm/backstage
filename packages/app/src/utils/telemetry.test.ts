import { getTelemetryPageViewPayload } from './telemetry';

describe('getTelemetryPageViewPayload', () => {
  it('should return correct payload for home page', () => {
    const result = getTelemetryPageViewPayload('/');
    expect(result).toEqual({
      page: 'Home',
      path: '/',
    });
  });

  describe('catalog', () => {
    it('should return correct payload for catalog index page', () => {
      expect(getTelemetryPageViewPayload('/catalog')).toEqual({
        page: 'Catalog index',
        path: '/catalog',
      });
    });

    it('reports an entity page by its kind and its route, not its names', () => {
      expect(
        getTelemetryPageViewPayload('/catalog/acme/component/payments-api'),
      ).toEqual({
        page: 'Catalog entity',
        entityKind: 'component',
        tab: 'overview',
        path: '/catalog/:namespace/:kind/:name',
      });
    });

    it('reports an entity page’s tab', () => {
      expect(
        getTelemetryPageViewPayload(
          '/catalog/acme/component/payments-api/pull-requests',
        ),
      ).toEqual({
        page: 'Catalog entity',
        entityKind: 'component',
        tab: 'pull-requests',
        path: '/catalog/:namespace/:kind/:name/pull-requests',
      });
    });

    it('reports the pages below a tab as that tab', () => {
      expect(
        getTelemetryPageViewPayload(
          '/catalog/acme/component/payments-api/docs/runbooks/outage',
        ),
      ).toEqual({
        page: 'Catalog entity',
        entityKind: 'component',
        tab: 'docs',
        path: '/catalog/:namespace/:kind/:name/docs/*',
      });
    });

    it('reports an unknown kind and tab without their text', () => {
      expect(
        getTelemetryPageViewPayload('/catalog/acme/acme-kind/x/acme-tab'),
      ).toEqual({
        page: 'Catalog entity',
        entityKind: 'other',
        tab: 'other',
        path: '/catalog/:namespace/:kind/:name/*',
      });
    });

    it('should return correct payload for catalog graph page', () => {
      expect(getTelemetryPageViewPayload('/catalog-graph')).toEqual({
        page: 'Catalog graph',
        path: '/catalog-graph',
      });
    });

    it('should return correct payload for docs index page', () => {
      expect(getTelemetryPageViewPayload('/docs')).toEqual({
        page: 'Docs index',
        path: '/docs',
      });
    });

    it('reports an entity’s docs by its kind and its route', () => {
      expect(
        getTelemetryPageViewPayload('/docs/acme/component/payments-api'),
      ).toEqual({
        page: 'Docs entity',
        entityKind: 'component',
        path: '/docs/:namespace/:kind/:name',
      });
      expect(
        getTelemetryPageViewPayload(
          '/docs/acme/component/payments-api/runbooks/outage',
        ),
      ).toEqual({
        page: 'Docs entity',
        entityKind: 'component',
        path: '/docs/:namespace/:kind/:name/*',
      });
    });
  });

  describe('scaffolder', () => {
    it('should return correct payload for software templates index page', () => {
      expect(getTelemetryPageViewPayload('/create')).toEqual({
        page: 'Software Templates index',
        path: '/create',
      });
    });

    it('reports a template’s form by its route, not its names', () => {
      expect(
        getTelemetryPageViewPayload('/create/templates/acme/acme-cluster'),
      ).toEqual({
        page: 'Software Template',
        path: '/create/templates/:namespace/:templateName',
      });
    });

    it.each([
      [
        '/create/tasks/0c4b2f5e-9a3d-4f1e-8b7a-2d6c1e0f9a3b',
        '/create/tasks/:taskId',
      ],
      ['/create/tasks', '/create/tasks'],
      ['/create/acme/template/acme-cluster', '/create/*'],
    ])('reports %s as %s', (pathname, route) => {
      expect(getTelemetryPageViewPayload(pathname)).toEqual({
        page: 'Software Template',
        path: route,
      });
    });
  });

  it.each([
    ['/settings', '/settings'],
    ['/settings/feature-flags', '/settings/feature-flags'],
    ['/settings/acme', '/settings/*'],
  ])('reports the settings page %s as %s', (pathname, route) => {
    expect(getTelemetryPageViewPayload(pathname)).toEqual({
      page: 'Settings',
      path: route,
    });
  });

  describe('Customize', () => {
    it('should return correct payload for the customize page', () => {
      expect(getTelemetryPageViewPayload('/customize')).toEqual({
        page: 'Customize',
        path: '/customize',
      });
    });

    it.each([
      'agents',
      'skills',
      'connectors',
      'models',
      'workflows',
      'workspaces',
    ])('reports the %s Customize tab as its view', tab => {
      expect(getTelemetryPageViewPayload(`/customize/${tab}`)).toEqual({
        page: 'Customize',
        view: tab,
        path: `/customize/${tab}`,
      });
    });

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
        path: '/customize/connectors/*',
      });
    });

    it('reports an unknown Customize tab without a view or its text', () => {
      expect(getTelemetryPageViewPayload('/customize/acme')).toEqual({
        page: 'Customize',
        path: '/customize/*',
      });
    });
  });

  describe('classic portal pages', () => {
    it('should return correct payload for installations index page', () => {
      expect(getTelemetryPageViewPayload('/installations')).toEqual({
        page: 'Installations index',
        path: '/installations',
      });
    });

    it('should return correct payload for clusters index page', () => {
      expect(getTelemetryPageViewPayload('/clusters')).toEqual({
        page: 'Clusters index',
        path: '/clusters',
      });
    });

    it('reports a cluster page by its route, not its names', () => {
      expect(
        getTelemetryPageViewPayload('/clusters/acme-prod/org-acme/payments01'),
      ).toEqual({
        page: 'Cluster details',
        tab: 'overview',
        path: '/clusters/:installationName/:namespace/:name',
      });
    });

    it('reports a cluster page’s tab', () => {
      expect(
        getTelemetryPageViewPayload(
          '/clusters/acme-prod/org-acme/payments01/ssh-access',
        ),
      ).toEqual({
        page: 'Cluster details',
        tab: 'ssh-access',
        path: '/clusters/:installationName/:namespace/:name/ssh-access',
      });
    });

    it('reports a deployment page by its kind and its route, not its names', () => {
      expect(
        getTelemetryPageViewPayload(
          '/deployments/acme-prod/helmrelease/org-acme/payments-api',
        ),
      ).toEqual({
        page: 'Deployment details',
        deploymentKind: 'helmrelease',
        tab: 'overview',
        path: '/deployments/:installationName/:kind/:namespace/:name',
      });
    });

    it('reports a deployment page’s tab, and an unknown one without its text', () => {
      expect(
        getTelemetryPageViewPayload(
          '/deployments/acme-prod/app/org-acme/payments-api/routes',
        ),
      ).toEqual({
        page: 'Deployment details',
        deploymentKind: 'app',
        tab: 'routes',
        path: '/deployments/:installationName/:kind/:namespace/:name/routes',
      });
      expect(
        getTelemetryPageViewPayload(
          '/deployments/acme-prod/app/org-acme/payments-api/acme-tab',
        ),
      ).toEqual({
        page: 'Deployment details',
        deploymentKind: 'app',
        tab: 'other',
        path: '/deployments/:installationName/:kind/:namespace/:name/*',
      });
    });

    it.each<[string, Record<string, string>]>([
      ['/flux', { page: 'Flux index', path: '/flux' }],
      ['/flux/tree', { page: 'Flux', view: 'tree', path: '/flux/tree' }],
      ['/flux/list', { page: 'Flux', view: 'list', path: '/flux/list' }],
      ['/flux/acme', { page: 'Flux', view: 'other', path: '/flux/*' }],
      ['/ai-chat', { page: 'AI Chat', path: '/ai-chat' }],
      [
        '/ai-chat/history',
        { page: 'AI Chat', view: 'history', path: '/ai-chat/history' },
      ],
      ['/ai-chat/acme', { page: 'AI Chat', view: 'other', path: '/ai-chat/*' }],
    ])('reports %s', (pathname, payload) => {
      expect(getTelemetryPageViewPayload(pathname)).toEqual(payload);
    });
  });

  // Each page of the Agent Platform keeps the page and view names it carried
  // at its old `/agent-platform/…` address, so the numbers stay continuous
  // across the move (giantswarm/giantswarm#38510); `path` is its route.
  it.each<[string, Record<string, string>, string]>([
    ['/sessions', { page: 'Sessions index' }, '/sessions'],
    [
      '/sessions/acme-prod/0c4b2f5e-9a3d-4f1e-8b7a-2d6c1e0f9a3b',
      { page: 'Session detail' },
      '/sessions/:installation/:sessionId',
    ],
    ['/usage', { page: 'Usage', view: 'overview' }, '/usage'],
    ['/usage/cost', { page: 'Usage', view: 'cost' }, '/usage/cost'],
    [
      '/usage/your-sessions',
      { page: 'Usage', view: 'conversations' },
      '/usage/your-sessions',
    ],
    // The view's path before it took its label, never released: no view.
    ['/usage/conversations', { page: 'Usage', view: 'redirect' }, '/usage/*'],
    [
      '/usage/connectors',
      { page: 'Usage', view: 'connectors' },
      '/usage/connectors',
    ],
    ['/usage/whatever', { page: 'Usage', view: 'redirect' }, '/usage/*'],
    ['/profile', { page: 'Profile' }, '/profile'],
    ['/profile/', { page: 'Profile' }, '/profile'],
    ['/profile/whatever', { page: 'Profile' }, '/profile/*'],
    ['/sessions/', { page: 'Sessions index' }, '/sessions'],
    ['/usage/', { page: 'Usage', view: 'overview' }, '/usage'],
    [
      '/customize/agents/new',
      { page: 'Agents', view: 'agents/new' },
      '/customize/agents/new',
    ],
    [
      '/customize/agents/new/skills',
      { page: 'Agents', view: 'agents/new/skills' },
      '/customize/agents/new/skills',
    ],
    [
      '/customize/agents/new/review',
      { page: 'Agents', view: 'agents/new/review' },
      '/customize/agents/new/review',
    ],
    [
      '/customize/agents/acme-prod/team-payments/invoice-helper',
      { page: 'Agent detail' },
      '/customize/agents/:installation/:namespace/:name',
    ],
    [
      '/customize/agents/acme-prod/team-payments/invoice-helper/tools',
      { page: 'Agent detail', view: 'tools' },
      '/customize/agents/:installation/:namespace/:name/tools',
    ],
    [
      '/customize/agents/acme-prod/team-payments/invoice-helper/sessions',
      { page: 'Agent detail', view: 'sessions' },
      '/customize/agents/:installation/:namespace/:name/sessions',
    ],
    [
      '/customize/agents/acme-prod/team-payments/invoice-helper/usage',
      { page: 'Agent detail', view: 'usage' },
      '/customize/agents/:installation/:namespace/:name/usage',
    ],
    [
      '/customize/agents/acme-prod/team-payments/invoice-helper/skills',
      { page: 'Agent detail', view: 'redirect' },
      '/customize/agents/:installation/:namespace/:name/*',
    ],
    [
      '/customize/agents/acme-prod/team-payments/invoice-helper/edit',
      { page: 'Agent edit' },
      '/customize/agents/:installation/:namespace/:name/edit',
    ],
    [
      '/customize/agents/acme-prod/team-payments/invoice-helper/edit/tools',
      { page: 'Agent edit', view: 'tools' },
      '/customize/agents/:installation/:namespace/:name/edit/tools',
    ],
    ['/customize/skills/new', { page: 'Add skill' }, '/customize/skills/new'],
    [
      '/customize/skills/edit/acme/agent-skills/ticket-triage',
      { page: 'Edit skill' },
      '/customize/skills/edit/*',
    ],
    [
      '/customize/skills/acme/agent-skills/ticket-triage',
      { page: 'Skill detail' },
      '/customize/skills/*',
    ],
    [
      '/customize/skills/acme/agent-skills/ticket-triage/used-by',
      { page: 'Skill detail', view: 'used-by' },
      '/customize/skills/*/used-by',
    ],
    [
      '/customize/skills/-/git.acme.example/platform/skills/-/ticket-triage',
      { page: 'Skill detail' },
      '/customize/skills/*',
    ],
    [
      '/customize/skills/-/git.acme.example/platform/skills/-/ticket-triage/instructions',
      { page: 'Skill detail', view: 'instructions' },
      '/customize/skills/*/instructions',
    ],
    [
      '/customize/connectors/new',
      { page: 'Connector registration', view: 'server' },
      '/customize/connectors/new',
    ],
    [
      '/customize/connectors/new/auth',
      { page: 'Connector registration', view: 'auth' },
      '/customize/connectors/new/auth',
    ],
    [
      '/customize/connectors/acme-prod/acme-jira/edit',
      { page: 'Connector registration', view: 'server' },
      '/customize/connectors/:installation/:server/edit',
    ],
    [
      '/customize/connectors/acme-prod/acme-jira/edit/verify',
      { page: 'Connector registration', view: 'verify' },
      '/customize/connectors/:installation/:server/edit/verify',
    ],
    [
      '/customize/connectors/acme-prod/acme-jira',
      { page: 'Connector', view: 'tools' },
      '/customize/connectors/:installation/:server',
    ],
    [
      '/customize/connectors/acme-prod/acme-jira/details',
      { page: 'Connector', view: 'details' },
      '/customize/connectors/:installation/:server/details',
    ],
    [
      '/customize/connectors/acme-prod/acme-jira/whatever',
      { page: 'Connector', view: 'redirect' },
      '/customize/connectors/:installation/:server/*',
    ],
    // An installation named like a sub-tab: two segments name a connector.
    [
      '/customize/connectors/infrastructure/x',
      { page: 'Connector', view: 'tools' },
      '/customize/connectors/:installation/:server',
    ],
    [
      '/customize/connectors/acme-prod/acme-jira/tools/x_acme_create_invoice',
      { page: 'Connector tool' },
      '/customize/connectors/:installation/:server/tools/:tool',
    ],
    [
      '/customize/workflows/acme-prod/rotate-payments-keys',
      { page: 'Workflow', view: 'overview' },
      '/customize/workflows/:installation/:name',
    ],
    [
      '/customize/workflows/acme-prod/rotate-payments-keys/run',
      { page: 'Workflow', view: 'run' },
      '/customize/workflows/:installation/:name/run',
    ],
    [
      '/customize/workflows/acme-prod/rotate-payments-keys/x',
      { page: 'Workflow', view: 'redirect' },
      '/customize/workflows/:installation/:name/*',
    ],
    [
      '/customize/models/new',
      { page: 'Models', view: 'new' },
      '/customize/models/new',
    ],
    [
      '/customize/models/hosting',
      { page: 'Models', view: 'serving' },
      '/customize/models/hosting',
    ],
    [
      '/customize/models/hosting/capacity',
      { page: 'Models', view: 'capacity' },
      '/customize/models/hosting/capacity',
    ],
    [
      '/customize/models/hosting/cache',
      { page: 'Models', view: 'cache' },
      '/customize/models/hosting/cache',
    ],
    [
      '/customize/models/hosting/x',
      { page: 'Models', view: 'redirect' },
      '/customize/models/hosting/*',
    ],
    [
      '/customize/models/hosting/serve',
      { page: 'Serve model' },
      '/customize/models/hosting/serve',
    ],
    [
      '/customize/models/hosting/import',
      { page: 'Import model' },
      '/customize/models/hosting/import',
    ],
    [
      '/customize/models/hosting/pull',
      { page: 'Pull model' },
      '/customize/models/hosting/pull',
    ],
    [
      '/customize/models/hosting/add-backend',
      { page: 'Add model backend' },
      '/customize/models/hosting/add-backend',
    ],
    [
      '/customize/models/hosting/capacity/add-pool',
      { page: 'Add GPU node pool' },
      '/customize/models/hosting/capacity/add-pool',
    ],
    [
      '/customize/models/acme-prod/team-payments/acme-llm',
      { page: 'Model detail' },
      '/customize/models/:installation/:namespace/:name',
    ],
    [
      '/customize/models/acme-prod/team-payments/acme-llm/usage',
      { page: 'Model detail', view: 'usage' },
      '/customize/models/:installation/:namespace/:name/usage',
    ],
    [
      '/customize/models/acme-prod/team-payments/acme-llm/edit',
      { page: 'Model edit' },
      '/customize/models/:installation/:namespace/:name/edit',
    ],
  ])('reports %s under its page name', (pathname, payload, route) => {
    expect(getTelemetryPageViewPayload(pathname)).toEqual({
      ...payload,
      path: route,
    });
  });

  // The old tree only redirects, in one hop; the page the visit lands on
  // reports itself right after, so these neither count as that page nor open
  // a dimension with their segments.
  it.each([
    '/agent-platform/sessions',
    '/agent-platform/agents/acme-prod/team-payments/invoice-helper/tools',
    '/agent-platform/connectors/acme-jira',
    '/agent-platform/mcp-servers/acme-jira',
    '/agent-platform/models/serving',
    '/agent-platform/usage/overview',
    '/agent-platform/profile',
  ])('reports the old address %s as a redirect', pathname => {
    expect(getTelemetryPageViewPayload(pathname)).toEqual({
      page: 'Agent Platform redirect',
      path: '/agent-platform/*',
    });
  });

  it('reports the old tree’s root as a redirect', () => {
    expect(getTelemetryPageViewPayload('/agent-platform')).toEqual({
      page: 'Agent Platform redirect',
      path: '/agent-platform',
    });
  });

  it.each([
    ['/agents', '/agents'],
    ['/agents/new', '/agents/*'],
    ['/agents/acme-prod/team-payments/invoice-helper', '/agents/*'],
  ])('reports the older short path %s as a redirect', (pathname, route) => {
    expect(getTelemetryPageViewPayload(pathname)).toEqual({
      page: 'Agents redirect',
      path: route,
    });
  });

  it.each<[string, Record<string, string>]>([
    ['/plans', { page: 'Plans index', path: '/plans' }],
    // No `view`: the only varying segment is a pull request number, so
    // echoing it would emit a page name per plan.
    ['/plans/pr/22', { page: 'Plan detail', path: '/plans/pr/:number' }],
    ['/bot-prs', { page: 'Bot PRs', path: '/bot-prs' }],
    ['/product', { page: 'Product magazine', path: '/product' }],
    ['/roadmap', { page: 'Roadmap index', path: '/roadmap' }],
    [
      '/roadmap/items/PVTI_abc123',
      { page: 'Roadmap item', path: '/roadmap/items/:id' },
    ],
    // Seen in Sentry: the item route is navigated to with an empty id while
    // the board is still resolving. It must not fall through to 'Unknown
    // page'.
    ['/roadmap/items/', { page: 'Roadmap item', path: '/roadmap/items/:id' }],
    ['/hive', { page: 'Hive now', path: '/hive' }],
    ['/hive/now', { page: 'Hive now', path: '/hive/now' }],
    ['/hive/history', { page: 'Hive history', path: '/hive/history' }],
    ['/hive/roadmap', { page: 'Hive roadmap', path: '/hive/roadmap' }],
    [
      '/hive/roadmap/items/PVTI_x',
      { page: 'Hive roadmap item', path: '/hive/roadmap/items/:id' },
    ],
    ['/hive/plans', { page: 'Hive plans', path: '/hive/plans' }],
    [
      '/hive/plans/pr/22',
      { page: 'Hive plan detail', path: '/hive/plans/pr/:number' },
    ],
    ['/hive/knowledge', { page: 'Hive knowledge', path: '/hive/knowledge' }],
    ['/metrics', { page: 'Metrics', path: '/metrics' }],
    ['/search', { page: 'Search', path: '/search' }],
  ])('reports %s', (pathname, payload) => {
    expect(getTelemetryPageViewPayload(pathname)).toEqual(payload);
  });

  it('reports an unknown path as unknown, never the path itself', () => {
    expect(
      getTelemetryPageViewPayload('/acme-prod/team-payments/invoice-helper'),
    ).toEqual({
      page: 'Unknown page',
      path: 'unknown',
    });
  });

  // The rule the mapping is there for: no name or id from the path reaches
  // an attribute (docs/telemetry.md). Each path is built from made-up names
  // of the shape real ones have, and none of them may appear in any value.
  it.each([
    '/catalog/acme/component/payments-api/docs/payments-runbook',
    '/docs/acme/component/payments-api/payments-runbook',
    '/create/templates/acme/acme-cluster',
    '/create/tasks/0c4b2f5e-9a3d-4f1e-8b7a-2d6c1e0f9a3b',
    '/clusters/acme-prod/org-acme/payments01/acme-tab',
    '/deployments/acme-prod/acme-kind/org-acme/payments-api/acme-tab',
    '/sessions/acme-prod/0c4b2f5e-9a3d-4f1e-8b7a-2d6c1e0f9a3b',
    '/customize/agents/acme-prod/team-payments/invoice-helper/acme-tab',
    '/customize/agents/acme-prod/team-payments/invoice-helper/edit/tools',
    '/customize/models/acme-prod/team-payments/acme-llm/acme-tab',
    '/customize/connectors/acme-prod/acme-jira/tools/x_acme_create_invoice',
    '/customize/workflows/acme-prod/rotate-payments-keys/acme-tab',
    '/customize/skills/acme/payments-skills/invoice-triage/used-by',
    '/customize/skills/edit/acme/payments-skills/invoice-triage',
    '/customize/acme-tab',
    '/agent-platform/agents/acme-prod/team-payments/invoice-helper',
    '/agents/acme-prod/team-payments/invoice-helper',
    '/settings/acme-tab',
    '/flux/acme-tab',
    '/ai-chat/acme-tab',
    '/usage/acme-tab',
    '/profile/acme-tab',
    '/plans/acme-tab',
    '/roadmap/acme-tab',
    '/hive/plans/acme-tab',
    '/acme-prod/payments-api',
  ])('carries no name or id from %s', pathname => {
    const values = Object.values(getTelemetryPageViewPayload(pathname));
    for (const value of values) {
      expect(value).not.toMatch(
        /acme|payments|invoice|0c4b2f5e|rotate|team-|org-/,
      );
    }
  });

  // Guard rail: every registered top-level route must map to a named page
  // and a route. A registered route that falls through to 'Unknown page' is
  // reported to Sentry as an "Untracked page view" warning on every visit
  // (see TelemetryDeckAnalyticsApi.captureEvent). When you add a new
  // page/route, add a case to getTelemetryPageViewPayload and list a
  // representative path here so a forgotten mapping fails CI instead of
  // flooding Sentry.
  describe('all known top-level routes resolve to a named page', () => {
    const knownTopLevelPaths = [
      '/',
      '/catalog',
      '/catalog/default/component/my-component',
      '/catalog-graph',
      '/catalog-import',
      '/docs',
      '/docs/default/component/my-component',
      '/create',
      '/create/templates/default/my-template',
      '/create/tasks/abc',
      '/settings',
      '/settings/general',
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
      '/clusters/installation/org-demo/demo-cluster/node-pools',
      '/deployments',
      '/deployments/gorilla/helmrelease/org-demo/my-app',
      '/deployments/gorilla/app/org-demo/my-app/routes',
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
      const payload = getTelemetryPageViewPayload(pathname);
      expect(payload.page).not.toBe('Unknown page');
      // A route template, with every segment of a fixed set and a
      // placeholder for the rest: never `unknown`, never a `*` at the top.
      expect(payload.path).toMatch(/^\/([a-z-]+(\/.*)?)?$/);
    });
  });
});
