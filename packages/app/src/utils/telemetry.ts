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
const USAGE_VIEWS: ReadonlySet<string> = new Set([
  'cost',
  'conversations',
  'connectors',
]);

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

export function getTelemetryPageViewPayload(pathname: string): {
  [key: string]: string;
} {
  let payload = {};

  switch (true) {
    case pathname === '/':
      payload = { page: 'Home' };
      break;

    case pathname === '/catalog':
      payload = { page: 'Catalog index' };
      break;

    case pathname === '/catalog-graph':
      payload = { page: 'Catalog graph' };
      break;

    case pathname.startsWith('/catalog'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Catalog entity',
        entityNamespace: parts[2],
        entityKind: parts[3],
        entityName: parts[4],
        tab: parts[5] ?? 'overview',
      };
      break;
    }

    case pathname === '/docs':
      payload = { page: 'Docs index' };
      break;

    case pathname.startsWith('/docs'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Docs entity',
        entityNamespace: parts[2],
        entityKind: parts[3],
        entityName: parts[4],
      };
      break;
    }

    case pathname === '/create':
      payload = { page: 'Software Templates index' };
      break;

    case pathname.startsWith('/create'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Software Template',
        templateNamespace: parts[2],
        templateName: parts[4],
      };
      break;
    }

    case pathname.startsWith('/settings'):
      payload = { page: 'Settings' };
      break;

    case pathname === '/customize':
      payload = { page: 'Customize' };
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
      break;
    }

    // The edit wizard for one agent:
    // `/customize/agents/<installation>/<namespace>/<name>/edit`, then its
    // `skills`, `tools` and `review` steps. One page; the step goes in
    // `view` — a fixed, public set like the detail page's tabs — and the
    // identifying segments stay out of both dimensions (they are still in
    // `path`, as on every page). Above the agent-detail case, which would
    // read `edit` as an unknown tab.
    case /^\/customize\/agents\/[^/]+\/[^/]+\/[^/]+\/edit(\/(skills|tools|review))?\/?$/.test(
      pathname,
    ): {
      const step = pathname.split('/')[7];
      payload = step
        ? { page: 'Agent edit', view: step }
        : { page: 'Agent edit' };
      break;
    }

    // One agent: `/customize/agents/<installation>/<namespace>/<name>`,
    // optionally followed by one of its tabs. The three identifying segments
    // are kept out of `page` and `view`, for the same reason as Session
    // detail: those are the dimensions TelemetryDeck aggregates on, so a
    // path-shaped value there is a distinct signal name per agent rather than
    // a countable page. It is not a privacy property — every payload below
    // carries `path: pathname` verbatim; it is about keeping the dimension
    // bounded. The tab, by contrast, belongs in `view`: a fixed, public set.
    // Overview is the index and carries no `view`, so the `Agent detail`
    // numbers stay continuous; any other address under the agent only
    // redirects to Overview.
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
      break;
    }

    // The add-skill form. Above the skill-detail case, whose prefix match
    // would otherwise swallow it.
    case pathname === '/customize/skills/new':
      payload = { page: 'Add skill' };
      break;

    // Editing a skill: `/customize/skills/edit/<owner>/<repo>[/<dir>]`. No
    // `view`, like the skill page itself.
    case pathname.startsWith('/customize/skills/edit/'):
      payload = { page: 'Edit skill' };
      break;

    // One skill: `/customize/skills/<owner>/<repo>[/<skill dir>]`, or
    // `/customize/skills/-/<host>/<repo path>[/-/<skill dir>]` for a skill
    // outside github.com. The varying segments name a repository and a skill
    // directory, which would open the dimension up per skill, so the only
    // `view` is the tab — a closed set, the trailing `instructions` or
    // `used-by` (the Overview, the skill's own path, has none).
    case /^\/customize\/skills\/[^/]+\/./.test(pathname): {
      const tab = /\/(instructions|used-by)\/?$/.exec(pathname)?.[1];
      payload = tab
        ? { page: 'Skill detail', view: tab }
        : { page: 'Skill detail' };
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
      break;
    }

    // A tool's page beneath its connector.
    case /^\/customize\/connectors\/[^/]+\/[^/]+\/tools\/[^/]+/.test(pathname):
      payload = { page: 'Connector tool' };
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
      break;
    }

    // Connecting a model, under the name its old address carried.
    case /^\/customize\/models\/new\/?$/.test(pathname):
      payload = { page: 'Models', view: 'new' };
      break;

    // Model hosting's create flows, each a page of its own under the view it
    // adds to: `…/models/hosting/{serve,import,pull,add-backend}` and
    // `…/models/hosting/capacity/add-pool`. One page each, so a flow is
    // counted apart from the view it was opened on.
    case /^\/customize\/models\/hosting\/(serve|import|pull|add-backend|capacity\/add-pool)\/?$/.test(
      pathname,
    ):
      payload = {
        page: HOSTING_FLOW_PAGES[pathname.replace(/\/$/, '').split('/').pop()!],
      };
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
      break;
    }

    // Editing one model, `…/models/<installation>/<namespace>/<name>/edit`.
    // One page, the model in neither `page` nor `view`. Above the model
    // page, which would read `edit` as an unknown tab.
    case /^\/customize\/models\/[^/]+\/[^/]+\/[^/]+\/edit\/?$/.test(pathname):
      payload = { page: 'Model edit' };
      break;

    // One model: `/customize/models/<installation>/<namespace>/<name>`,
    // optionally followed by one of its tabs. One page, the model in neither
    // `page` nor `view` (it is in `path`, as on every page): `page` and `view`
    // are the dimensions TelemetryDeck aggregates on, and path segments there
    // would make a signal per model. The tab goes in `view`, a closed set;
    // Overview, the index, carries none, so the `Model detail` numbers stay
    // continuous across the split into tabs, and any other address under the
    // model's only redirects to Overview, so it reports as a 'redirect'
    // rather than a view named by free text from the URL. A trailing slash
    // is the same page, as the router has it. Above the tab case, which
    // would report it as the Models tab.
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
      } else if (
        tab === 'connectors' &&
        CONNECTOR_SUBTABS.has(sub) &&
        deeper.length === 0
      ) {
        payload = { page: 'Customize', view: tab, subview: sub };
      } else {
        payload = { page: 'Customize', view: tab };
      }
      break;
    }

    case pathname === '/installations':
      payload = { page: 'Installations index' };
      break;

    case pathname === '/clusters':
      payload = { page: 'Clusters index' };
      break;

    case pathname.startsWith('/clusters'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Cluster details',
        installation: parts[2],
        clusterNamespace: parts[3],
        clusterName: parts[4],
        tab: parts[5] ?? 'overview',
      };
      break;
    }

    case pathname === '/deployments':
      payload = { page: 'Deployments index' };
      break;

    case pathname.startsWith('/deployments'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Deployment details',
        installation: parts[2],
        deploymentKind: parts[3],
        deploymentNamespace: parts[4],
        deploymentName: parts[5],
        tab: parts[6] ?? 'overview',
      };
      break;
    }

    case pathname === '/flux':
      payload = { page: 'Flux index' };
      break;

    case pathname.startsWith('/flux'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Flux',
        view: parts[2],
      };
      break;
    }

    case pathname === '/ai-chat':
      payload = { page: 'AI Chat' };
      break;

    case pathname.startsWith('/ai-chat'): {
      const parts = pathname.split('/');
      payload = {
        page: 'AI Chat',
        view: parts[2],
      };
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
      break;

    case pathname.startsWith('/sessions/'):
      payload = { page: 'Session detail' };
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
      } else if (USAGE_VIEWS.has(view)) {
        usageView = view;
      }
      payload = { page: 'Usage', view: usageView };
      break;
    }

    // The shell's minimal "Profile and settings" page: who is signed in, with
    // sign out — the rail's profile menu links here instead of the classic
    // `/settings`. The page has no sub-routes: anything below it renders
    // the same page, so it carries the same name.
    case pathname === '/profile' || pathname.startsWith('/profile/'):
      payload = { page: 'Profile' };
      break;

    // The Agent Platform's old URL tree, which only redirects now, in one
    // hop, to its place under `/`, `/sessions`, `/usage`, `/profile` and
    // `/customize` (the app's `legacyAgentPlatformTarget`); the page the
    // visit lands on reports itself right after. One name for every old
    // address, so a stale link neither counts as the page it leads to nor
    // brings its segments along as views.
    case pathname === '/agent-platform' ||
      pathname.startsWith('/agent-platform/'):
      payload = { page: 'Agent Platform redirect' };
      break;

    // `/agents` and below, the older short path, redirect the same way.
    case pathname === '/agents' || pathname.startsWith('/agents/'):
      payload = { page: 'Agents redirect' };
      break;

    case pathname === '/plans':
      payload = { page: 'Plans index' };
      break;

    // One plan: `/plans/pr/<number>`. Deliberately carries no `view`: the only
    // varying segment is a pull request number, which would emit a distinct
    // page name per plan — useless as a metric. The full path is reported
    // separately as `path` either way.
    case pathname.startsWith('/plans'):
      payload = { page: 'Plan detail' };
      break;

    // The Bot PRs page (`/bot-prs`): the team and the filters live in the
    // query string, which `pathname` never carries, so one page name covers
    // every team.
    case pathname === '/bot-prs':
      payload = { page: 'Bot PRs' };
      break;

    case pathname === '/roadmap':
      payload = { page: 'Roadmap index' };
      break;

    // One roadmap item: `/roadmap/items/<id>`. No `view`, for the same reason
    // as Plan detail — the varying segment is an opaque item id.
    case pathname.startsWith('/roadmap'):
      payload = { page: 'Roadmap item' };
      break;

    // The Magazine page (`/product`): its tab, history window and knowledge
    // document live in the query string, so one page name covers them all.
    case pathname === '/product':
      payload = { page: 'Product magazine' };
      break;

    // Hive (`/hive`): one page name per tab, a bare `/hive` landing on Now.
    // The board's items and the plans' reviews are details without `view`,
    // like Roadmap item and Plan detail: the varying segment is an id.
    case pathname === '/hive' || pathname === '/hive/now':
      payload = { page: 'Hive now' };
      break;

    case pathname === '/hive/history':
      payload = { page: 'Hive history' };
      break;

    case pathname === '/hive/roadmap':
      payload = { page: 'Hive roadmap' };
      break;

    case pathname.startsWith('/hive/roadmap/'):
      payload = { page: 'Hive roadmap item' };
      break;

    case pathname === '/hive/plans':
      payload = { page: 'Hive plans' };
      break;

    case pathname.startsWith('/hive/plans/'):
      payload = { page: 'Hive plan detail' };
      break;

    case pathname === '/hive/knowledge':
      payload = { page: 'Hive knowledge' };
      break;

    case pathname === '/metrics':
      payload = { page: 'Metrics' };
      break;

    case pathname === '/search':
      payload = { page: 'Search' };
      break;

    default:
      payload = { page: 'Unknown page' };
  }

  return {
    ...payload,
    path: pathname,
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
