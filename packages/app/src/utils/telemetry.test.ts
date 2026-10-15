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

  it('reports no subview for a path below a sub-tab, which redirects', () => {
    expect(
      getTelemetryPageViewPayload('/customize/connectors/infrastructure/x'),
    ).toEqual({
      page: 'Customize',
      view: 'connectors',
      path: '/customize/connectors/infrastructure/x',
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

  it.each([
    ['/agent-platform/connectors', { page: 'Connectors' }],
    [
      '/agent-platform/connectors/new',
      { page: 'Connector registration', view: 'server' },
    ],
    [
      '/agent-platform/connectors/new/auth',
      { page: 'Connector registration', view: 'auth' },
    ],
    [
      '/agent-platform/connectors/kubernetes',
      { page: 'Connector', view: 'tools' },
    ],
    [
      '/agent-platform/connectors/kubernetes/details',
      { page: 'Connector', view: 'details' },
    ],
    [
      '/agent-platform/connectors/kubernetes/instances',
      { page: 'Connector', view: 'instances' },
    ],
    [
      '/agent-platform/connectors/kubernetes/used-by',
      { page: 'Connector', view: 'used-by' },
    ],
    [
      '/agent-platform/connectors/kubernetes/tools/x_kubernetes_get_pods',
      { page: 'Connector tool' },
    ],
    // A connector named like a wizard step is not one: only `new` is.
    [
      '/agent-platform/connectors/newsroom',
      { page: 'Connector', view: 'tools' },
    ],
    // The tab's old address only redirects now; every path under it reports
    // as the target page.
    ['/agent-platform/mcp-servers', { page: 'Connectors', view: 'redirect' }],
    [
      '/agent-platform/mcp-servers/kubernetes/tools/x_kubernetes_get_pods',
      { page: 'Connectors', view: 'redirect' },
    ],
    ['/agent-platform/workflows', { page: 'Workflows' }],
    [
      '/agent-platform/workflows/my-workflow',
      { page: 'Workflow', view: 'overview' },
    ],
    [
      '/agent-platform/workflows/my-workflow/run',
      { page: 'Workflow', view: 'run' },
    ],
    [
      '/agent-platform/workflows/my-workflow/usage',
      { page: 'Workflow', view: 'usage' },
    ],
    [
      '/agent-platform/workflows/my-workflow/details',
      { page: 'Workflow', view: 'details' },
    ],
    [
      '/agent-platform/workflows/my-workflow/usage/',
      { page: 'Workflow', view: 'usage' },
    ],
    // An address the page no longer has only redirects to Overview.
    [
      '/agent-platform/workflows/my-workflow/runs',
      { page: 'Workflow', view: 'redirect' },
    ],
    [
      '/agent-platform/workflows/my-workflow/wp-login.php',
      { page: 'Workflow', view: 'redirect' },
    ],
    [
      '/agent-platform/workflows/my-workflow/usage/extra',
      { page: 'Workflow', view: 'redirect' },
    ],
    // The old section's paths, one name and no view, not the Agents page.
    ['/agent-platform/muster', { page: 'Muster (removed)' }],
    [
      '/agent-platform/muster/servers/kubernetes/tools/x_kubernetes_get_pods',
      { page: 'Muster (removed)' },
    ],
    // Not the old section: only `muster` itself is.
    ['/agent-platform/musterish', { page: 'Agents', view: 'musterish' }],
  ])(
    'should report muster tab path %s under its own page name',
    (path, payload) => {
      expect(getTelemetryPageViewPayload(path)).toEqual({ ...payload, path });
    },
  );

  it('should return correct payload for the sessions tab', () => {
    // Reported as its own page rather than falling through to the generic
    // agent-platform case, which would label it `page: 'Agents'`.
    const result = getTelemetryPageViewPayload('/agent-platform/sessions');
    expect(result).toEqual({
      page: 'Sessions index',
      path: '/agent-platform/sessions',
    });
  });

  it('should return correct payload for one session', () => {
    // No `view`: the path carries an installation name and an opaque session id,
    // so echoing them would emit a page name per session — and record which
    // installations a user reads.
    const result = getTelemetryPageViewPayload(
      '/agent-platform/sessions/gazelle/019f8a13-c6c2-73af-a1d9-ab0abeeb6734',
    );
    expect(result).toEqual({
      page: 'Session detail',
      path: '/agent-platform/sessions/gazelle/019f8a13-c6c2-73af-a1d9-ab0abeeb6734',
    });
  });

  describe('the Models tab', () => {
    // Without cases of its own the whole tab fell through to the generic
    // agent-platform branch as `page: 'Agents'`, merging its numbers into the
    // Agents page's — and the detail path put an installation, a namespace and
    // a model name into `view`, one signal name per model.
    it('names the tab index', () => {
      expect(getTelemetryPageViewPayload('/agent-platform/models')).toEqual({
        page: 'Models index',
        path: '/agent-platform/models',
      });
    });

    it.each([
      ['/agent-platform/models/serving', 'serving'],
      ['/agent-platform/models/capacity', 'capacity'],
      ['/agent-platform/models/cache', 'cache'],
      ['/agent-platform/models/hosting', 'hosting'],
      ['/agent-platform/models/new', 'new'],
      // The paths an older release's links still carry, before the redirect to
      // the tab root lands.
      ['/agent-platform/models/configs', 'configs'],
      // Deeper than a view, and still reported as what it belongs to.
      ['/agent-platform/models/configs/new', 'configs'],
    ])('reports %s as its view', (pathname, view) => {
      expect(getTelemetryPageViewPayload(pathname)).toEqual({
        page: 'Models',
        view,
        path: pathname,
      });
    });

    it.each([
      ['/agent-platform/models/serving/serve', 'Serve model'],
      ['/agent-platform/models/serving/import', 'Import model'],
      ['/agent-platform/models/serving/pull', 'Pull model'],
      ['/agent-platform/models/serving/add-backend', 'Add model backend'],
      ['/agent-platform/models/capacity/add-pool', 'Add GPU node pool'],
    ])('counts the hosting flow %s as its own page', (pathname, page) => {
      expect(getTelemetryPageViewPayload(pathname)).toEqual({
        page,
        path: pathname,
      });
    });

    it.each([
      '/customize/models/gazelle/agent-platform/gpt-4o',
      '/customize/models/gazelle/agent-platform/gpt-4o/',
    ])('names one model without naming it in page or view: %s', pathname => {
      expect(getTelemetryPageViewPayload(pathname)).toEqual({
        page: 'Model detail',
        path: pathname,
      });
    });

    it.each([
      ['/customize/models/gazelle/agent-platform/gpt-4o/usage', 'usage'],
      ['/customize/models/gazelle/agent-platform/gpt-4o/used-by', 'used-by'],
      ['/customize/models/gazelle/agent-platform/gpt-4o/used-by/', 'used-by'],
    ])('reports the model page tab %s as the view', (pathname, view) => {
      expect(getTelemetryPageViewPayload(pathname)).toEqual({
        page: 'Model detail',
        view,
        path: pathname,
      });
    });

    // Anything else under the model's address only redirects to Overview, so
    // the URL's free text never becomes a view. The former Details tab too:
    // its Technical details are Overview's now.
    it.each([
      '/customize/models/gazelle/agent-platform/gpt-4o/details',
      '/customize/models/gazelle/agent-platform/gpt-4o/overview',
      '/customize/models/gazelle/agent-platform/gpt-4o/wp-login.php',
      '/customize/models/gazelle/agent-platform/gpt-4o/usage/extra',
    ])(
      'reports an unknown address under a model as a redirect: %s',
      pathname => {
        expect(getTelemetryPageViewPayload(pathname)).toEqual({
          page: 'Model detail',
          view: 'redirect',
          path: pathname,
        });
      },
    );

    // The old path only redirects; the page it lands on reports Model detail.
    it("counts a model's former path apart, so an old link is one Model detail", () => {
      const pathname = '/agent-platform/models/gazelle/agent-platform/gpt-4o';

      expect(getTelemetryPageViewPayload(pathname)).toEqual({
        page: 'Model detail redirect',
        path: pathname,
      });
    });

    // Editing is the Connect-a-model flow at `models/edit/<installation>/
    // <namespace>/<name>`: one page, the model in neither dimension — not a
    // `view: 'edit'` of the tab, nor a detail page of a model named by its
    // last three segments.
    it('counts the model edit flow as one page, not one per model', () => {
      const pathname =
        '/agent-platform/models/edit/gazelle/agent-platform/gpt-4o';

      expect(getTelemetryPageViewPayload(pathname)).toEqual({
        page: 'Model edit',
        path: pathname,
      });
    });
  });

  it('should return correct payload for one agent', () => {
    // No `view`: the path names an installation, a namespace and an agent, so
    // echoing them would emit a page name per agent — and record which
    // installations a user reads.
    const result = getTelemetryPageViewPayload(
      '/agent-platform/agents/gazelle/agent-platform/pr-reviewer',
    );
    expect(result).toEqual({
      page: 'Agent detail',
      path: '/agent-platform/agents/gazelle/agent-platform/pr-reviewer',
    });
  });

  it.each(['tools', 'skills', 'sessions', 'usage'])(
    "should name the agent detail page's %s tab without naming the agent",
    tab => {
      const pathname = `/agent-platform/agents/gazelle/agent-platform/pr-reviewer/${tab}`;
      // The tab is a fixed, public name, so it is safe to report as a `view`
      // where the installation and agent segments are not.
      expect(getTelemetryPageViewPayload(pathname)).toEqual({
        page: 'Agent detail',
        view: tab,
        path: pathname,
      });
    },
  );

  // The edit form used to fall through to the generic agent-platform case,
  // which echoes the rest of the path into `view` — one signal name per agent,
  // in the dimension TelemetryDeck aggregates on. `path` still carries the
  // whole pathname here, as it does for every page; what this pins is that the
  // agent does not reach `page` or `view`.
  it('counts the agent edit page as one page, not one per agent', () => {
    const pathname =
      '/agent-platform/agents/gazelle/agent-platform/pr-reviewer/edit';

    expect(getTelemetryPageViewPayload(pathname)).toEqual({
      page: 'Agent edit',
      path: pathname,
    });
  });

  // Editing is the create wizard at `agents/edit/<installation>/<namespace>/<name>`:
  // one page, the step as its `view`, the agent in neither dimension.
  it('counts the agent edit wizard as one page, its step as the view', () => {
    const base =
      '/agent-platform/agents/edit/gazelle/agent-platform/pr-reviewer';

    expect(getTelemetryPageViewPayload(base)).toEqual({
      page: 'Agent edit',
      path: base,
    });
    for (const step of ['skills', 'tools', 'review']) {
      expect(getTelemetryPageViewPayload(`${base}/${step}`)).toEqual({
        page: 'Agent edit',
        view: step,
        path: `${base}/${step}`,
      });
    }
  });

  // The create flow sits under `agents/` too and is not an agent detail view:
  // `agents/new`, `agents/new/skills` and `agents/new/review` keep reporting
  // through the generic agent-platform case.
  it('should not treat the create flow as an agent detail page', () => {
    expect(
      getTelemetryPageViewPayload('/agent-platform/agents/new/review'),
    ).toEqual({
      page: 'Agents',
      view: 'agents/new/review',
      path: '/agent-platform/agents/new/review',
    });
  });

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
      '/installations',
      '/clusters',
      '/clusters/installation/org-demo/demo-cluster',
      '/deployments',
      '/deployments/gorilla/helmrelease/org-demo/my-app',
      '/flux',
      '/flux/tree',
      '/ai-chat',
      '/ai-chat/history',
      '/agent-platform/connectors',
      '/agent-platform/connectors/new',
      '/agent-platform/connectors/new/verify',
      '/agent-platform/connectors/kubernetes',
      '/agent-platform/connectors/kubernetes/details',
      '/agent-platform/connectors/kubernetes/used-by',
      '/agent-platform/connectors/kubernetes/tools/x_kubernetes_get_pods',
      '/agent-platform/mcp-servers',
      '/agent-platform/workflows',
      '/agent-platform/workflows/my-workflow',
      '/agent-platform/workflows/my-workflow/run',
      '/agent-platform/workflows/my-workflow/usage',
      '/agent-platform/workflows/my-workflow/details',
      '/agent-platform',
      '/agent-platform/agents/new',
      '/agent-platform/agents/new/skills',
      '/agent-platform/agents/new/review',
      '/agent-platform/agents/gazelle/agent-platform/pr-reviewer',
      '/agent-platform/agents/gazelle/agent-platform/pr-reviewer/tools',
      '/agent-platform/agents/gazelle/agent-platform/pr-reviewer/skills',
      '/agent-platform/agents/gazelle/agent-platform/pr-reviewer/sessions',
      '/agent-platform/agents/gazelle/agent-platform/pr-reviewer/usage',
      '/agent-platform/agents/gazelle/agent-platform/pr-reviewer/edit',
      '/agent-platform/agents/edit/gazelle/agent-platform/pr-reviewer',
      '/agent-platform/agents/edit/gazelle/agent-platform/pr-reviewer/skills',
      '/agent-platform/agents/edit/gazelle/agent-platform/pr-reviewer/tools',
      '/agent-platform/agents/edit/gazelle/agent-platform/pr-reviewer/review',
      '/agent-platform/sessions',
      '/agent-platform/sessions/gazelle/abc123',
      '/agent-platform/skills',
      '/agent-platform/skills/new',
      '/agent-platform/skills/edit/giantswarm/agent-skills/ticket-triage',
      '/agent-platform/skills/giantswarm/agent-skills/ticket-triage',
      '/agent-platform/skills/giantswarm/agent-skills/ticket-triage/instructions',
      '/agent-platform/skills/giantswarm/agent-skills/ticket-triage/used-by',
      '/agent-platform/skills/-/gitea.lab.local/lab/skills/-/ticket-triage',
      '/agent-platform/profile',
      '/agent-platform/usage',
      '/agent-platform/usage/overview',
      '/agents',
      '/agents/new',
      '/agent-platform/usage/cost',
      '/agent-platform/usage/connectors',
      '/agent-platform/usage/conversations',
      '/agent-platform/usage/mcp',
      // Pre-existing gaps in this list, closed while adding the one above.
      '/agent-platform/models',
      '/agent-platform/models/serving',
      '/agent-platform/models/new',
      '/agent-platform/models/gazelle/agent-platform/gpt-4o',
      '/agent-platform/models/edit/gazelle/agent-platform/gpt-4o',
      '/agent-platform/models/capacity',
      '/agent-platform/models/cache',
      '/agent-platform/models/hosting',
      '/agent-platform/models/serving/serve',
      '/agent-platform/models/serving/import',
      '/agent-platform/models/serving/pull',
      '/agent-platform/models/serving/add-backend',
      '/agent-platform/models/capacity/add-pool',
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

describe('Usage sub-tabs', () => {
  it('reports the bare Usage path unchanged, for continuity', () => {
    expect(getTelemetryPageViewPayload('/agent-platform/usage')).toEqual({
      page: 'Usage',
      path: '/agent-platform/usage',
    });
  });

  it.each([
    ['overview', '/agent-platform/usage/overview'],
    ['cost', '/agent-platform/usage/cost'],
    ['connectors', '/agent-platform/usage/connectors'],
    ['conversations', '/agent-platform/usage/conversations'],
    ['mcp', '/agent-platform/usage/mcp'],
  ])('reports the %s view under page Usage', (view, path) => {
    expect(getTelemetryPageViewPayload(path)).toEqual({
      page: 'Usage',
      view,
      path,
    });
  });

  it('does not let a Usage view fall through to the generic Agents case', () => {
    // Without the prefix case above the generic '/agent-platform' one, every
    // Usage view would report as `page: 'Agents', view: 'usage/cost'` —
    // merging the tab's numbers into the Agents page's.
    expect(
      getTelemetryPageViewPayload('/agent-platform/usage/cost'),
    ).not.toMatchObject({ page: 'Agents' });
  });
});

describe('Profile', () => {
  it('reports the shell profile page as its own page, not an Agents view', () => {
    expect(getTelemetryPageViewPayload('/agent-platform/profile')).toEqual({
      page: 'Profile',
      path: '/agent-platform/profile',
    });
  });
});

describe('Skill detail', () => {
  it('reports one page name, with no view, whatever the skill', () => {
    expect(
      getTelemetryPageViewPayload(
        '/agent-platform/skills/giantswarm/agent-skills/ticket-triage',
      ),
    ).toEqual({
      page: 'Skill detail',
      path: '/agent-platform/skills/giantswarm/agent-skills/ticket-triage',
    });
    expect(getTelemetryPageViewPayload('/agent-platform/skills').page).toBe(
      'Skill detail',
    );
  });

  it.each(['instructions', 'used-by'])(
    'reports the %s tab as the view, for GitHub and other git skills',
    tab => {
      expect(
        getTelemetryPageViewPayload(
          `/agent-platform/skills/giantswarm/agent-skills/ticket-triage/${tab}`,
        ),
      ).toEqual({
        page: 'Skill detail',
        view: tab,
        path: `/agent-platform/skills/giantswarm/agent-skills/ticket-triage/${tab}`,
      });
      expect(
        getTelemetryPageViewPayload(
          `/agent-platform/skills/-/gitea.lab.local/lab/skills/-/ticket-triage/${tab}`,
        ),
      ).toMatchObject({ page: 'Skill detail', view: tab });
    },
  );

  it('reports a skill outside github.com as a skill page, with no view', () => {
    expect(
      getTelemetryPageViewPayload(
        '/agent-platform/skills/-/gitea.lab.local/lab/skills/-/ticket-triage',
      ),
    ).toEqual({
      page: 'Skill detail',
      path: '/agent-platform/skills/-/gitea.lab.local/lab/skills/-/ticket-triage',
    });
  });

  it('reports the add-skill form as its own page, not a skill', () => {
    expect(getTelemetryPageViewPayload('/agent-platform/skills/new')).toEqual({
      page: 'Add skill',
      path: '/agent-platform/skills/new',
    });
  });

  it('reports editing a skill as its own page, whatever the skill', () => {
    expect(
      getTelemetryPageViewPayload(
        '/agent-platform/skills/edit/giantswarm/agent-skills/ticket-triage',
      ),
    ).toEqual({
      page: 'Edit skill',
      path: '/agent-platform/skills/edit/giantswarm/agent-skills/ticket-triage',
    });
  });
});
