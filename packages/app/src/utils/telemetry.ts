import sha256 from 'crypto-js/sha256';
import {
  AGENT_PAGE_TABS,
  MODEL_PAGE_TABS,
} from '@giantswarm/backstage-plugin-agent-platform';
import {
  CONNECTOR_GROUPS,
  CONNECTOR_PAGE_TAB_PATHS,
  WORKFLOW_PAGE_TABS,
} from '@giantswarm/backstage-plugin-muster';
import { CUSTOMIZE_TAB_IDS } from '../modules/agentShell/customizeTabIds';

/** The `/customize/:tab` tabs, a fixed set safe to report as a view. */
const CUSTOMIZE_TABS: ReadonlySet<string> = new Set(CUSTOMIZE_TAB_IDS);

/**
 * The Connectors tab's sub-tabs below its own address (muster's
 * `CONNECTOR_GROUPS`, the default at the tab's own address left out), a fixed
 * set too.
 */
const CONNECTOR_SUBTABS: ReadonlySet<string> = new Set(
  CONNECTOR_GROUPS.map(group => group.path).filter(Boolean),
);

/**
 * A workflow page's tabs below its own address (Overview, the index, left
 * out), a fixed set too.
 */
const WORKFLOW_TABS: ReadonlySet<string> = new Set(
  WORKFLOW_PAGE_TABS.map(tab => tab.path).filter(Boolean),
);

/**
 * A model page's tabs below its own address (Overview, the index, left out),
 * a fixed set too.
 */
const MODEL_TABS: ReadonlySet<string> = new Set(
  MODEL_PAGE_TABS.map(tab => tab.path).filter(Boolean),
);

/**
 * An agent page's tabs below its own address (Overview, the index, left
 * out), a fixed set too.
 */
const AGENT_TABS: ReadonlySet<string> = new Set(
  AGENT_PAGE_TABS.map(tab => tab.path).filter(Boolean),
);

/**
 * A connector page's tabs below its own address (Tools, the index, left
 * out), a fixed set too.
 */
const CONNECTOR_TABS: ReadonlySet<string> = new Set(CONNECTOR_PAGE_TAB_PATHS);

/** Usage's views below its own address (Overview, the bare path, left out). */
const USAGE_VIEWS: Record<string, string> = {
  cost: 'cost',
  // "Your sessions", under the view name its old `conversations` path gave
  // it, so its numbers stay continuous.
  'your-sessions': 'conversations',
  connectors: 'connectors',
};

/** Usage's paths below its own address, the keys of `USAGE_VIEWS`. */
const USAGE_PATHS: ReadonlySet<string> = new Set(Object.keys(USAGE_VIEWS));

/**
 * Model hosting's views by their path below `hosting`, as the `view` names
 * they carried as views of the Models page.
 */
const HOSTING_VIEWS: Record<string, string> = {
  '': 'serving',
  capacity: 'capacity',
  cache: 'cache',
};

/** Model hosting's create flows by their last path segment, as page names. */
const HOSTING_FLOW_PAGES: Record<string, string> = {
  serve: 'Serve model',
  import: 'Import model',
  pull: 'Pull model',
  'add-backend': 'Add model backend',
  'add-pool': 'Add GPU node pool',
};

/**
 * The catalog's entity kinds, as its URLs spell them. A closed set: any other
 * segment in a kind's place is reported as `other`.
 */
const ENTITY_KINDS: ReadonlySet<string> = new Set([
  'api',
  'component',
  'domain',
  'group',
  'location',
  'resource',
  'system',
  'template',
  'user',
]);

/**
 * An entity page's tabs below its own address (Overview, the index, left
 * out): the entity contents the app mounts, from this app, our plugins and
 * Backstage's. A fixed set; any other segment is reported as `other`.
 */
const ENTITY_TABS: ReadonlySet<string> = new Set([
  'apis',
  'capabilities',
  'circleci',
  'definition',
  'dependencies',
  'deployments',
  'docs',
  'github-actions',
  'graph',
  'kubernetes',
  'pull-requests',
  'version-history',
]);

/** A cluster page's tabs below its own address, a fixed set too. */
const CLUSTER_TABS: ReadonlySet<string> = new Set([
  'deployments',
  'node-pools',
  'rbac',
  'ssh-access',
]);

/** A deployment page's tabs below its own address, a fixed set too. */
const DEPLOYMENT_TABS: ReadonlySet<string> = new Set(['routes']);

/** The kinds of deployment a deployment page's URL names. */
const DEPLOYMENT_KINDS: ReadonlySet<string> = new Set(['app', 'helmrelease']);

/** The user settings page's tabs (`general` is its index). */
const SETTINGS_TABS: ReadonlySet<string> = new Set([
  'general',
  'auth-providers',
  'feature-flags',
]);

/** The scaffolder's pages below `/create` that name nothing. */
const SCAFFOLDER_PAGES: ReadonlySet<string> = new Set([
  'actions',
  'custom-fields',
  'edit',
  'tasks',
  'template-form',
  'templating-extensions',
]);

/** The Flux page's views below its own address. */
const FLUX_VIEWS: ReadonlySet<string> = new Set(['list', 'tree']);

/** The AI Chat page's views below its own address. */
const AI_CHAT_VIEWS: ReadonlySet<string> = new Set(['history']);

/** What a page view reports for a path no page below matches. */
const UNKNOWN_ROUTE = 'unknown';

/** The path's segments, without the empty ones its slashes leave. */
function segmentsOf(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

/**
 * The route template of a page with tabs below `base`: `base` for its index,
 * `base/<tab>` for one of its `tabs`, `base/*` for any other address. With
 * `nested`, a tab owns the addresses below it too (`base/<tab>/*`), as an
 * entity content does.
 */
function tabRoute(
  base: string,
  tab: string,
  tabs: ReadonlySet<string>,
  { nested = false }: { nested?: boolean } = {},
): string {
  if (tab === '') {
    return base;
  }
  if (tabs.has(tab)) {
    return `${base}/${tab}`;
  }
  const [first] = tab.split('/');
  return nested && tabs.has(first) ? `${base}/${first}/*` : `${base}/*`;
}

/**
 * The `pageview` signal's attributes for a pathname (no query string, no
 * hash): the page's name, its `view` and the like, and as `path` the
 * template of the route it matched (`/sessions/:installation/:sessionId`),
 * never the pathname itself. A pathname carries the names of installations,
 * namespaces, agents, models, connectors, clusters and entities, and session
 * ids; none of those may reach TelemetryDeck (see docs/telemetry.md). Every
 * attribute is a fixed string or one of a closed set; a segment outside its
 * set is reported as `other`, `redirect` or `*`, and a path no case matches
 * as `unknown`.
 */
export function getTelemetryPageViewPayload(pathname: string): {
  [key: string]: string;
} {
  let payload = {};
  let route = UNKNOWN_ROUTE;
  const segments = segmentsOf(pathname);

  switch (true) {
    case pathname === '/':
      payload = { page: 'Home' };
      route = '/';
      break;

    case pathname === '/catalog' || pathname === '/catalog/':
      payload = { page: 'Catalog index' };
      route = '/catalog';
      break;

    case pathname === '/catalog-graph':
      payload = { page: 'Catalog graph' };
      route = '/catalog-graph';
      break;

    // One entity: `/catalog/<namespace>/<kind>/<name>`, optionally followed
    // by one of its tabs. The namespace and the name stay out: the kind and
    // the tab are the only attributes, each from its closed set.
    case pathname.startsWith('/catalog'): {
      payload = { page: 'Catalog entity' };
      if (segments[0] === 'catalog-import') {
        route = '/catalog-import';
      } else if (segments[0] === 'catalog' && segments.length >= 4) {
        const kind = segments[2].toLocaleLowerCase('en-US');
        const tab = segments.slice(4).join('/');
        const [firstTab] = segments.slice(4);
        let tabName = 'other';
        if (tab === '') {
          tabName = 'overview';
        } else if (ENTITY_TABS.has(firstTab)) {
          tabName = firstTab;
        }
        payload = {
          page: 'Catalog entity',
          entityKind: ENTITY_KINDS.has(kind) ? kind : 'other',
          tab: tabName,
        };
        route = tabRoute('/catalog/:namespace/:kind/:name', tab, ENTITY_TABS, {
          nested: true,
        });
      } else if (segments[0] === 'catalog') {
        route = '/catalog/*';
      }
      break;
    }

    case pathname === '/docs':
      payload = { page: 'Docs index' };
      route = '/docs';
      break;

    // One entity's docs: `/docs/<namespace>/<kind>/<name>`, then the page of
    // the docs. The kind is the only attribute.
    case pathname.startsWith('/docs'): {
      if (segments[0] === 'docs' && segments.length >= 4) {
        const kind = segments[2].toLocaleLowerCase('en-US');
        payload = {
          page: 'Docs entity',
          entityKind: ENTITY_KINDS.has(kind) ? kind : 'other',
        };
        route =
          segments.length > 4
            ? '/docs/:namespace/:kind/:name/*'
            : '/docs/:namespace/:kind/:name';
      } else {
        payload = { page: 'Docs entity' };
        route = segments[0] === 'docs' ? '/docs/*' : UNKNOWN_ROUTE;
      }
      break;
    }

    case pathname === '/create':
      payload = { page: 'Software Templates index' };
      route = '/create';
      break;

    // A template's form, `/create/templates/<namespace>/<name>`, a task, or
    // one of the scaffolder's own pages. The template's names stay out.
    case pathname.startsWith('/create'): {
      payload = { page: 'Software Template' };
      const [, sub, ...rest] = segments;
      if (segments[0] !== 'create') {
        route = UNKNOWN_ROUTE;
      } else if (sub === 'templates' && rest.length === 2) {
        route = '/create/templates/:namespace/:templateName';
      } else if (sub === 'tasks' && rest.length === 1) {
        route = '/create/tasks/:taskId';
      } else if (SCAFFOLDER_PAGES.has(sub) && rest.length === 0) {
        route = `/create/${sub}`;
      } else {
        route = '/create/*';
      }
      break;
    }

    case pathname.startsWith('/settings'):
      payload = { page: 'Settings' };
      route =
        segments[0] === 'settings'
          ? tabRoute('/settings', segments.slice(1).join('/'), SETTINGS_TABS)
          : UNKNOWN_ROUTE;
      break;

    case pathname === '/customize':
      payload = { page: 'Customize' };
      route = '/customize';
      break;

    // What lives below the Customize tabs' lists, under the names these
    // pages carried at their old `/agent-platform/…` addresses, so the
    // numbers stay continuous across the move. Above the model page and the
    // generic tab case, which would report them as a model or a tab.
    //
    // The agent create wizard: `/customize/agents/new`, then its `skills`,
    // `tools` and `review` steps. The old generic case named it the Agents
    // page with the path as its view, `agents/new[/<step>]`; a closed set.
    case /^\/customize\/agents\/new(\/(skills|tools|review))?\/?$/.test(
      pathname,
    ): {
      const step = pathname.split('/')[4];
      payload = {
        page: 'Agents',
        view: step ? `agents/new/${step}` : 'agents/new',
      };
      route = step ? `/customize/agents/new/${step}` : '/customize/agents/new';
      break;
    }

    // The edit wizard for one agent:
    // `/customize/agents/<installation>/<namespace>/<name>/edit`, then its
    // `skills`, `tools` and `review` steps. One page; the step goes in
    // `view` — a fixed, public set like the detail page's tabs — and the
    // identifying segments stay out of every attribute. Above the
    // agent-detail case, which would read `edit` as an unknown tab.
    case /^\/customize\/agents\/[^/]+\/[^/]+\/[^/]+\/edit(\/(skills|tools|review))?\/?$/.test(
      pathname,
    ): {
      const step = pathname.split('/')[7];
      payload = step
        ? { page: 'Agent edit', view: step }
        : { page: 'Agent edit' };
      route = `/customize/agents/:installation/:namespace/:name/edit${
        step ? `/${step}` : ''
      }`;
      break;
    }

    // One agent: `/customize/agents/<installation>/<namespace>/<name>`,
    // optionally followed by one of its tabs. The three identifying segments
    // are kept out of every attribute: `path` carries them as placeholders.
    // The tab belongs in `view`: a fixed, public set. Overview is the index
    // and carries no `view`, so the `Agent detail` numbers stay continuous;
    // any other address under the agent only redirects to Overview.
    case /^\/customize\/agents\/[^/]+\/[^/]+\/[^/]+(\/.*)?$/.test(pathname): {
      const tab = pathname.split('/').slice(6).filter(Boolean).join('/');
      if (tab === '') {
        payload = { page: 'Agent detail' };
      } else {
        payload = {
          page: 'Agent detail',
          view: AGENT_TABS.has(tab) ? tab : 'redirect',
        };
      }
      route = tabRoute(
        '/customize/agents/:installation/:namespace/:name',
        tab,
        AGENT_TABS,
      );
      break;
    }

    // The add-skill form. Above the skill-detail case, whose prefix match
    // would otherwise swallow it.
    case pathname === '/customize/skills/new':
      payload = { page: 'Add skill' };
      route = '/customize/skills/new';
      break;

    // Editing a skill: `/customize/skills/edit/<owner>/<repo>[/<dir>]`. No
    // `view`, like the skill page itself.
    case pathname.startsWith('/customize/skills/edit/'):
      payload = { page: 'Edit skill' };
      route = '/customize/skills/edit/*';
      break;

    // One skill: `/customize/skills/<owner>/<repo>[/<skill dir>]`, or
    // `/customize/skills/-/<host>/<repo path>[/-/<skill dir>]` for a skill
    // outside github.com. The varying segments name a repository and a skill
    // directory, of any depth, so `path` has them as one `*`, and the only
    // `view` is the tab — a closed set, the trailing `instructions` or
    // `used-by` (the Overview, the skill's own path, has none).
    case /^\/customize\/skills\/[^/]+\/./.test(pathname): {
      const tab = /\/(instructions|used-by)\/?$/.exec(pathname)?.[1];
      payload = tab
        ? { page: 'Skill detail', view: tab }
        : { page: 'Skill detail' };
      route = tab ? `/customize/skills/*/${tab}` : '/customize/skills/*';
      break;
    }

    // The connector wizard: registering one (`/customize/connectors/new`) or
    // editing one (`…/<installation>/<server>/edit`), with the step as the
    // view. Both runs are the same steps, and were one page at their old
    // address (`…/new?edit=<name>`), so they keep one name. The wizard's
    // first step is its index, `server`.
    case /^\/customize\/connectors\/(new|[^/]+\/[^/]+\/edit)(\/(auth|verify))?\/?$/.test(
      pathname,
    ): {
      const step = /\/(auth|verify)\/?$/.exec(pathname)?.[1];
      payload = { page: 'Connector registration', view: step ?? 'server' };
      const base =
        segments[2] === 'new'
          ? '/customize/connectors/new'
          : '/customize/connectors/:installation/:server/edit';
      route = step ? `${base}/${step}` : base;
      break;
    }

    // A tool's page beneath its connector.
    case /^\/customize\/connectors\/[^/]+\/[^/]+\/tools\/[^/]+/.test(pathname):
      payload = { page: 'Connector tool' };
      route =
        segments.length === 6
          ? '/customize/connectors/:installation/:server/tools/:tool'
          : '/customize/connectors/:installation/:server/tools/:tool/*';
      break;

    // A connector's page, `/customize/connectors/<installation>/<server>`,
    // with its tab as the view: Tools, the index, by name. Two segments, so
    // the list's sub-tabs (one) never reach it.
    case /^\/customize\/connectors\/(?!new\/)[^/]+\/[^/]+(\/.*)?$/.test(
      pathname,
    ): {
      const tab = pathname.split('/').slice(5).filter(Boolean).join('/');
      let view = 'redirect';
      if (tab === '') {
        view = 'tools';
      } else if (CONNECTOR_TABS.has(tab)) {
        view = tab;
      }
      payload = { page: 'Connector', view };
      route = tabRoute(
        '/customize/connectors/:installation/:server',
        tab,
        CONNECTOR_TABS,
      );
      break;
    }

    // A workflow's page, `/customize/workflows/<installation>/<name>`, with
    // its tab as the view (never its name). Its tabs are a closed set; any
    // other address under it only redirects to Overview, so that momentary
    // view is a 'redirect' rather than a second Overview visit.
    case /^\/customize\/workflows\/[^/]+\/[^/]+(\/.*)?$/.test(pathname): {
      const tab = pathname.split('/').slice(5).filter(Boolean).join('/');
      let view = 'redirect';
      if (tab === '') {
        view = 'overview';
      } else if (WORKFLOW_TABS.has(tab)) {
        view = tab;
      }
      payload = { page: 'Workflow', view };
      route = tabRoute(
        '/customize/workflows/:installation/:name',
        tab,
        WORKFLOW_TABS,
      );
      break;
    }

    // Connecting a model, under the name its old address carried.
    case /^\/customize\/models\/new\/?$/.test(pathname):
      payload = { page: 'Models', view: 'new' };
      route = '/customize/models/new';
      break;

    // Model hosting's create flows, each a page of its own under the view it
    // adds to: `…/models/hosting/{serve,import,pull,add-backend}` and
    // `…/models/hosting/capacity/add-pool`. One page each, so a flow is
    // counted apart from the view it was opened on. A fixed path each.
    case /^\/customize\/models\/hosting\/(serve|import|pull|add-backend|capacity\/add-pool)\/?$/.test(
      pathname,
    ):
      payload = {
        page: HOSTING_FLOW_PAGES[pathname.replace(/\/$/, '').split('/').pop()!],
      };
      route = `/${segments.join('/')}`;
      break;

    // Model hosting's views, under the Models page's names: Running models,
    // the bare `hosting`, is `serving` as it was. Any other address only
    // redirects to it.
    case /^\/customize\/models\/hosting(\/.*)?$/.test(pathname): {
      const view = pathname.split('/').slice(4).filter(Boolean).join('/');
      payload = {
        page: 'Models',
        view: HOSTING_VIEWS[view] ?? 'redirect',
      };
      route = Object.hasOwn(HOSTING_VIEWS, view)
        ? `/customize/models/hosting${view ? `/${view}` : ''}`
        : '/customize/models/hosting/*';
      break;
    }

    // Editing one model, `…/models/<installation>/<namespace>/<name>/edit`.
    // One page, the model in no attribute. Above the model page, which
    // would read `edit` as an unknown tab.
    case /^\/customize\/models\/[^/]+\/[^/]+\/[^/]+\/edit\/?$/.test(pathname):
      payload = { page: 'Model edit' };
      route = '/customize/models/:installation/:namespace/:name/edit';
      break;

    // One model: `/customize/models/<installation>/<namespace>/<name>`,
    // optionally followed by one of its tabs. One page, the model in no
    // attribute: `path` has it as placeholders. The tab goes in `view`, a
    // closed set; Overview, the index, carries none, so the `Model detail`
    // numbers stay continuous across the split into tabs, and any other
    // address under the model's only redirects to Overview, so it reports
    // as a 'redirect' rather than a view named by free text from the URL. A
    // trailing slash is the same page, as the router has it. Above the tab
    // case, which would report it as the Models tab.
    case /^\/customize\/models\/[^/]+\/[^/]+\/[^/]+(\/.*)?$/.test(pathname): {
      const tab = pathname.split('/').slice(6).filter(Boolean).join('/');
      if (tab === '') {
        payload = { page: 'Model detail' };
      } else {
        payload = {
          page: 'Model detail',
          view: MODEL_TABS.has(tab) ? tab : 'redirect',
        };
      }
      route = tabRoute(
        '/customize/models/:installation/:namespace/:name',
        tab,
        MODEL_TABS,
      );
      break;
    }

    // A Customize tab, with the tab as the view. Only the known tabs: the
    // segment comes from the URL, and an unknown one redirects to the Agents tab.
    // The Connectors tab's sub-tabs below its own address add a `subview`; the
    // tab's own address is its default sub-tab, the customer's connectors.
    case pathname.startsWith('/customize/'): {
      const [, , tab, sub, ...deeper] = pathname.split('/');
      if (!CUSTOMIZE_TABS.has(tab)) {
        payload = { page: 'Customize' };
        route = '/customize/*';
      } else if (
        tab === 'connectors' &&
        CONNECTOR_SUBTABS.has(sub) &&
        deeper.length === 0
      ) {
        payload = { page: 'Customize', view: tab, subview: sub };
        route = `/customize/connectors/${sub}`;
      } else {
        payload = { page: 'Customize', view: tab };
        route =
          segments.length > 2 ? `/customize/${tab}/*` : `/customize/${tab}`;
      }
      break;
    }

    case pathname === '/installations':
      payload = { page: 'Installations index' };
      route = '/installations';
      break;

    case pathname === '/clusters':
      payload = { page: 'Clusters index' };
      route = '/clusters';
      break;

    // One cluster: `/clusters/<installation>/<namespace>/<name>`, optionally
    // followed by one of its tabs. The tab is the only attribute.
    case pathname.startsWith('/clusters'): {
      if (segments[0] === 'clusters' && segments.length >= 4) {
        const tab = segments.slice(4).join('/');
        let tabName = 'other';
        if (tab === '') {
          tabName = 'overview';
        } else if (CLUSTER_TABS.has(segments[4])) {
          tabName = segments[4];
        }
        payload = { page: 'Cluster details', tab: tabName };
        route = tabRoute(
          '/clusters/:installationName/:namespace/:name',
          tab,
          CLUSTER_TABS,
          { nested: true },
        );
      } else {
        payload = { page: 'Cluster details' };
        route = segments[0] === 'clusters' ? '/clusters/*' : UNKNOWN_ROUTE;
      }
      break;
    }

    case pathname === '/deployments':
      payload = { page: 'Deployments index' };
      route = '/deployments';
      break;

    // One deployment: `/deployments/<installation>/<kind>/<namespace>/<name>`,
    // optionally followed by one of its tabs. The kind and the tab are the
    // only attributes, each from its closed set.
    case pathname.startsWith('/deployments'): {
      if (segments[0] === 'deployments' && segments.length >= 5) {
        const tab = segments.slice(5).join('/');
        let tabName = 'other';
        if (tab === '') {
          tabName = 'overview';
        } else if (DEPLOYMENT_TABS.has(segments[5])) {
          tabName = segments[5];
        }
        payload = {
          page: 'Deployment details',
          deploymentKind: DEPLOYMENT_KINDS.has(segments[2])
            ? segments[2]
            : 'other',
          tab: tabName,
        };
        route = tabRoute(
          '/deployments/:installationName/:kind/:namespace/:name',
          tab,
          DEPLOYMENT_TABS,
          { nested: true },
        );
      } else {
        payload = { page: 'Deployment details' };
        route =
          segments[0] === 'deployments' ? '/deployments/*' : UNKNOWN_ROUTE;
      }
      break;
    }

    case pathname === '/flux':
      payload = { page: 'Flux index' };
      route = '/flux';
      break;

    case pathname.startsWith('/flux'): {
      const view = segments.slice(1).join('/');
      payload = {
        page: 'Flux',
        view: FLUX_VIEWS.has(view) ? view : 'other',
      };
      route =
        segments[0] === 'flux'
          ? tabRoute('/flux', view, FLUX_VIEWS)
          : UNKNOWN_ROUTE;
      break;
    }

    case pathname === '/ai-chat':
      payload = { page: 'AI Chat' };
      route = '/ai-chat';
      break;

    case pathname.startsWith('/ai-chat'): {
      const view = segments.slice(1).join('/');
      payload = {
        page: 'AI Chat',
        view: AI_CHAT_VIEWS.has(view) ? view : 'other',
      };
      route =
        segments[0] === 'ai-chat'
          ? tabRoute('/ai-chat', view, AI_CHAT_VIEWS)
          : UNKNOWN_ROUTE;
      break;
    }

    // The rail's Sessions: the list, and one session at
    // `/sessions/<installation>/<id>`. The session carries no `view`: those
    // segments are an installation name and an opaque session id, so
    // including them would emit a distinct page name per session — useless
    // as a metric, and it would record which installations a user reads.
    // A trailing slash is the same page, as the router has it.
    case pathname === '/sessions' || pathname === '/sessions/':
      payload = { page: 'Sessions index' };
      route = '/sessions';
      break;

    case pathname.startsWith('/sessions/'):
      payload = { page: 'Session detail' };
      route =
        segments.length === 3
          ? '/sessions/:installation/:sessionId'
          : '/sessions/*';
      break;

    // The rail's Usage, with its view: Overview is the bare path and keeps
    // its name, `overview`, so the numbers stay continuous across the move
    // from `/agent-platform/usage/overview`. The views are a fixed, public
    // set; any other address only redirects to Overview.
    case pathname === '/usage' || pathname.startsWith('/usage/'): {
      // A trailing slash is the same view, as the router has it.
      const view = pathname.split('/').slice(2).filter(Boolean).join('/');
      let usageView = 'redirect';
      if (view === '') {
        usageView = 'overview';
      } else if (USAGE_PATHS.has(view)) {
        usageView = USAGE_VIEWS[view];
      }
      payload = { page: 'Usage', view: usageView };
      route = tabRoute('/usage', view, USAGE_PATHS);
      break;
    }

    // The shell's minimal "Profile and settings" page: who is signed in, with
    // sign out — the rail's profile menu links here instead of the classic
    // `/settings`. The page has no sub-routes: anything below it renders
    // the same page, so it carries the same name.
    case pathname === '/profile' || pathname.startsWith('/profile/'):
      payload = { page: 'Profile' };
      route = segments.length > 1 ? '/profile/*' : '/profile';
      break;

    // The Agent Platform's old URL tree, which only redirects now, in one
    // hop, to its place under `/`, `/sessions`, `/usage`, `/profile` and
    // `/customize` (the app's `legacyAgentPlatformTarget`); the page the
    // visit lands on reports itself right after. One name and one route for
    // every old address, so a stale link neither counts as the page it
    // leads to nor brings its segments along — the names in them included.
    case pathname === '/agent-platform' ||
      pathname.startsWith('/agent-platform/'):
      payload = { page: 'Agent Platform redirect' };
      route = segments.length > 1 ? '/agent-platform/*' : '/agent-platform';
      break;

    // `/agents` and below, the older short path, redirect the same way.
    case pathname === '/agents' || pathname.startsWith('/agents/'):
      payload = { page: 'Agents redirect' };
      route = segments.length > 1 ? '/agents/*' : '/agents';
      break;

    case pathname === '/plans':
      payload = { page: 'Plans index' };
      route = '/plans';
      break;

    // One plan: `/plans/pr/<number>`. Deliberately carries no `view`: the only
    // varying segment is a pull request number, which would emit a distinct
    // page name per plan — useless as a metric.
    case pathname.startsWith('/plans'):
      payload = { page: 'Plan detail' };
      if (segments[0] !== 'plans') {
        route = UNKNOWN_ROUTE;
      } else if (segments[1] === 'pr' && segments.length === 3) {
        route = '/plans/pr/:number';
      } else {
        route = '/plans/*';
      }
      break;

    // The Bot PRs page (`/bot-prs`): the team and the filters live in the
    // query string, which `pathname` never carries, so one page name covers
    // every team.
    case pathname === '/bot-prs':
      payload = { page: 'Bot PRs' };
      route = '/bot-prs';
      break;

    case pathname === '/roadmap':
      payload = { page: 'Roadmap index' };
      route = '/roadmap';
      break;

    // One roadmap item: `/roadmap/items/<id>`. No `view`, for the same reason
    // as Plan detail — the varying segment is an opaque item id.
    case pathname.startsWith('/roadmap'):
      payload = { page: 'Roadmap item' };
      if (segments[0] !== 'roadmap') {
        route = UNKNOWN_ROUTE;
      } else if (segments[1] === 'items') {
        // Seen navigated to with no id while the board is still resolving.
        route = '/roadmap/items/:id';
      } else {
        route = '/roadmap/*';
      }
      break;

    // The Magazine page (`/product`): its tab, history window and knowledge
    // document live in the query string, so one page name covers them all.
    case pathname === '/product':
      payload = { page: 'Product magazine' };
      route = '/product';
      break;

    // Hive (`/hive`): one page name per tab, a bare `/hive` landing on Now.
    // The board's items and the plans' reviews are details without `view`,
    // like Roadmap item and Plan detail: the varying segment is an id.
    case pathname === '/hive' || pathname === '/hive/now':
      payload = { page: 'Hive now' };
      route = pathname;
      break;

    case pathname === '/hive/history':
      payload = { page: 'Hive history' };
      route = '/hive/history';
      break;

    case pathname === '/hive/roadmap':
      payload = { page: 'Hive roadmap' };
      route = '/hive/roadmap';
      break;

    case pathname.startsWith('/hive/roadmap/'):
      payload = { page: 'Hive roadmap item' };
      route =
        segments[2] === 'items' && segments.length === 4
          ? '/hive/roadmap/items/:id'
          : '/hive/roadmap/*';
      break;

    case pathname === '/hive/plans':
      payload = { page: 'Hive plans' };
      route = '/hive/plans';
      break;

    case pathname.startsWith('/hive/plans/'):
      payload = { page: 'Hive plan detail' };
      route =
        segments[2] === 'pr' && segments.length === 4
          ? '/hive/plans/pr/:number'
          : '/hive/plans/*';
      break;

    case pathname === '/hive/knowledge':
      payload = { page: 'Hive knowledge' };
      route = '/hive/knowledge';
      break;

    case pathname === '/metrics':
      payload = { page: 'Metrics' };
      route = '/metrics';
      break;

    case pathname === '/search':
      payload = { page: 'Search' };
      route = '/search';
      break;

    default:
      payload = { page: 'Unknown page' };
  }

  return {
    ...payload,
    path: route,
  };
}

export function getGuestUserEntityRef(profile: {
  email?: string;
  displayName?: string;
}): string {
  const userHash = sha256(
    profile.email ?? profile.displayName ?? '',
  ).toString();

  return `user:default/guest#${userHash}`;
}
