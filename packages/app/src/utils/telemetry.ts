import sha256 from 'crypto-js/sha256';
import {
  CONNECTOR_GROUPS,
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

    // One model: `/customize/models/<installation>/<namespace>/<name>`. One
    // page, the model in neither `page` nor `view` (it is in `path`, as on
    // every page): `page` and `view` are the dimensions TelemetryDeck
    // aggregates on, and path segments there would make a signal per model.
    // The former `/agent-platform/models/…` path redirects here. A trailing
    // slash is the same page, as the router has it. Above the tab case, which
    // would report it as the Models tab.
    case /^\/customize\/models\/[^/]+\/[^/]+\/[^/]+\/?$/.test(pathname):
      payload = { page: 'Model detail' };
      break;

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

    // muster's two Agent Platform tabs, above the generic agent-platform cases
    // below, which would report them as the Agents page.
    case pathname === '/agent-platform/connectors':
      payload = { page: 'Connectors' };
      break;

    case /^\/agent-platform\/connectors\/new(\/|$)/.test(pathname): {
      const parts = pathname.split('/');
      payload = {
        page: 'Connector registration',
        // The wizard's first step is its index.
        view: parts[4] || 'server',
      };
      break;
    }

    // A tool's page beneath its connector, and a connector's page with its tab
    // as the view.
    case /^\/agent-platform\/connectors\/[^/]+\/tools\/[^/]+/.test(pathname):
      payload = { page: 'Connector tool' };
      break;

    case pathname.startsWith('/agent-platform/connectors/'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Connector',
        // Tools is the connector page's index.
        view: parts[4] || 'tools',
      };
      break;
    }

    // The tab's old address: every `/agent-platform/mcp-servers…` path only
    // redirects to its `/agent-platform/connectors…` counterpart now
    // (`ConnectorsRedirect`), so the momentary view counts as the target page
    // rather than opening a dimension or merging into the Agents page's
    // numbers.
    case pathname === '/agent-platform/mcp-servers' ||
      pathname.startsWith('/agent-platform/mcp-servers/'):
      payload = { page: 'Connectors', view: 'redirect' };
      break;

    case pathname === '/agent-platform/workflows':
      payload = { page: 'Workflows' };
      break;

    // The muster section's old home: no longer a tab, and not redirected
    // (the page renders its tab row over an empty body). One name for every
    // such path, so a stale bookmark neither counts as the Agents page nor
    // brings its server and tool names along as views.
    case pathname === '/agent-platform/muster' ||
      pathname.startsWith('/agent-platform/muster/'):
      payload = { page: 'Muster (removed)' };
      break;

    // A workflow's page, with its tab as the view (never its name). Its tabs
    // are a closed set; any other address under it only redirects to
    // Overview, so that momentary view is a 'redirect' rather than a second
    // Overview visit or a view named by free text from the URL.
    case pathname.startsWith('/agent-platform/workflows/'): {
      const tab = pathname.split('/').slice(4).filter(Boolean).join('/');
      let view = 'redirect';
      if (tab === '') {
        view = 'overview';
      } else if (WORKFLOW_TABS.has(tab)) {
        view = tab;
      }
      payload = { page: 'Workflow', view };
      break;
    }

    // Must stay above the generic '/agent-platform' cases below, for the reason
    // the Sessions and Usage cases give: without these the Models tab reports as
    // `page: 'Agents'`, merging its numbers into the Agents page's.
    case pathname === '/agent-platform/models':
      payload = { page: 'Models index' };
      break;

    // One model's former path, `…/models/<installation>/<namespace>/<name>`,
    // which only redirects to `/customize/models/…` (above); the page the
    // visit lands on reports itself as Model detail right after, so this one
    // must not, or each old link counts twice. Its own page, like the Agents
    // redirect, with no `view`: the segments name a model. Placed above the
    // views case so the three identifying segments cannot reach a `view`.
    case /^\/agent-platform\/models\/[^/]+\/[^/]+\/[^/]+\/?$/.test(pathname):
      payload = { page: 'Model detail redirect' };
      break;

    // Editing one model: the Connect-a-model flow prefilled, at
    // `…/models/edit/<installation>/<namespace>/<name>`. One page, the model in
    // neither `page` nor `view` (it is in `path`, as on every page), like
    // Agent edit. Four segments, so the detail case above never takes it; it
    // must stay above the views case, which would report `view: 'edit'`.
    case /^\/agent-platform\/models\/edit\/[^/]+\/[^/]+\/[^/]+$/.test(pathname):
      payload = { page: 'Model edit' };
      break;

    // Model hosting's create flows, each a page of its own under the view it
    // adds to: `…/models/serving/{serve,import,pull,add-backend}` and
    // `…/models/capacity/add-pool`. One page each, so a flow is counted apart
    // from the view it was opened on; must stay above the views case, which
    // would report it as that view.
    case /^\/agent-platform\/models\/(serving\/(serve|import|pull|add-backend)|capacity\/add-pool)\/?$/.test(
      pathname,
    ):
      payload = {
        page: HOSTING_FLOW_PAGES[pathname.replace(/\/$/, '').split('/')[4]],
      };
      break;

    // What hangs off the Models tab: the serving views (`serving`, `capacity`,
    // the agent-platform shell's `hosting`), `new`, and the `configs` paths an
    // older release's links still carry. Only the first segment, so anything
    // deeper collapses to what it belongs to instead of opening the dimension
    // up.
    case pathname.startsWith('/agent-platform/models'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Models',
        view: parts[3],
      };
      break;
    }

    // The add-skill form. Must stay above the skill-detail case below, whose
    // prefix match would otherwise swallow it.
    case pathname === '/agent-platform/skills/new':
      payload = { page: 'Add skill' };
      break;

    // Editing a skill: `/agent-platform/skills/edit/<owner>/<repo>[/<dir>]`.
    // No `view`, like the skill page itself. Must stay above the skill-detail
    // case below for the same reason as the add-skill form.
    case pathname.startsWith('/agent-platform/skills/edit/'):
      payload = { page: 'Edit skill' };
      break;

    // One skill: `/agent-platform/skills/<owner>/<repo>[/<skill dir>]`, or
    // `/agent-platform/skills/-/<host>/<repo path>[/-/<skill dir>]` for a
    // skill outside github.com. The varying segments name a repository and a
    // skill directory, which would open the dimension up per skill, so the
    // only `view` is the tab — a closed set, the trailing `instructions` or
    // `used-by` (the Overview, the skill's own path, has none). The bare path
    // only redirects to Customize → Skills and is folded in like the
    // mcp-servers redirect above. Must stay above the generic '/agent-platform'
    // cases below for the reason the Sessions cases give.
    case pathname === '/agent-platform/skills' ||
      pathname.startsWith('/agent-platform/skills/'): {
      const tab = /\/(instructions|used-by)\/?$/.exec(pathname)?.[1];
      payload = tab
        ? { page: 'Skill detail', view: tab }
        : { page: 'Skill detail' };
      break;
    }

    // Must stay above the generic '/agent-platform' cases below: `switch (true)`
    // takes the first match, so after them this would be dead and the Sessions
    // tab would report as `page: 'Agents', view: 'sessions'`.
    case pathname === '/agent-platform/sessions':
      payload = { page: 'Sessions index' };
      break;

    // One session: `/agent-platform/sessions/<installation>/<id>`. Deliberately
    // carries no `view`: those segments are an installation name and an opaque
    // session id, so including them would emit a distinct page name per session —
    // useless as a metric, and it would record which installations a user reads.
    case pathname.startsWith('/agent-platform/sessions/'):
      payload = { page: 'Session detail' };
      break;

    // The edit wizard for one agent:
    // `/agent-platform/agents/edit/<installation>/<namespace>/<name>`, then its
    // `skills`, `tools` and `review` steps. One page, like the former edit
    // form below; the step goes in `view` — a fixed, public set like the
    // detail page's tabs — and the identifying segments stay out of both
    // dimensions (they are still in `path`, as on every page). Must stay above
    // the agent-detail case, whose three dynamic segments would otherwise read
    // `edit/<installation>/<namespace>` as an agent.
    case /^\/agent-platform\/agents\/edit\/[^/]+\/[^/]+\/[^/]+(\/(skills|tools|review))?$/.test(
      pathname,
    ): {
      const step = pathname.split('/')[7];
      payload = step
        ? { page: 'Agent edit', view: step }
        : { page: 'Agent edit' };
      break;
    }

    // One agent: `/agent-platform/agents/<installation>/<namespace>/<name>`,
    // optionally followed by one of its tabs. The three identifying segments
    // are kept out of `page` and `view`, for the same reason as Session detail:
    // those are the dimensions TelemetryDeck aggregates on, so a path-shaped
    // value there is a distinct signal name per agent rather than a countable
    // page. It is not a privacy property — every payload below carries
    // `path: pathname` verbatim, so the names are transmitted for this page as
    // for every other one; it is about keeping the dimension bounded.
    //
    // The tab, by contrast, belongs in `view`: `tools`/`skills`/`sessions` (and
    // the agent shell's `usage`) is a fixed, public set, so it stays bounded — the same argument the Usage
    // views case makes. Overview is the index and keeps carrying no `view`, so
    // the existing `Agent detail` numbers stay continuous across this split.
    //
    // The tab names are spelled out rather than matched as `[^/]+` so this cannot
    // swallow `…/<name>/edit`, and the three identifying segments are still
    // required so it cannot swallow the create flow's `agents/new`,
    // `agents/new/skills` or `agents/new/review` — all of which keep reporting
    // through the generic case below.
    case /^\/agent-platform\/agents\/[^/]+\/[^/]+\/[^/]+(\/(tools|skills|sessions|usage))?$/.test(
      pathname,
    ): {
      // Absent for Overview, and left out of the payload entirely rather than
      // sent as an undefined attribute.
      const tab = pathname.split('/')[6];
      payload = tab
        ? { page: 'Agent detail', view: tab }
        : { page: 'Agent detail' };
      break;
    }

    // The edit wizard's former address, `…/<installation>/<namespace>/<name>/edit`,
    // which now only redirects to the wizard above. A page of its own rather
    // than a view of the detail page — and, like the detail case, it carries
    // no `view`.
    //
    // What that buys is a bounded dimension, not privacy. Every payload this
    // function returns carries `path: pathname` verbatim, so the installation,
    // namespace and agent name are transmitted for this page as they are for
    // every other one. `page` and `view` are what TelemetryDeck aggregates on,
    // and a path-shaped value there is a distinct signal name per agent —
    // which is what the generic '/agent-platform' case below produces, by
    // echoing the whole remainder of the path into `view`. This case exists so
    // the edit form counts as one page instead of one per agent; it does not
    // make the identifiers any less sent.
    case /^\/agent-platform\/agents\/[^/]+\/[^/]+\/[^/]+\/edit$/.test(pathname):
      payload = { page: 'Agent edit' };
      break;

    // Must stay above the generic '/agent-platform' cases below, like the
    // Sessions cases: `switch (true)` takes the first match, and without this
    // the Usage tab would report as `page: 'Agents', view: 'usage'` — merging
    // its views into the Agents page's numbers, which is exactly the question a
    // new tab exists to answer. It carries no `view`: the page is one view, and
    // the installation it reports on is scope state, not a page identity.
    case pathname === '/agent-platform/usage':
      payload = { page: 'Usage' };
      break;

    // The Usage tab's second-level views (`overview`, `cost`, `connectors`,
    // `conversations`, and the retired `mcp` and `technical` addresses, which
    // now only redirect to `connectors` and `overview`), with the view as its
    // one segment. The bare path above keeps its existing name rather than
    // becoming 'Usage index': it now only ever redirects here, and renaming it
    // would break continuity in TelemetryDeck for nothing.
    //
    // `view` is safe to include where a session or agent path's segments were
    // not: these views are a fixed, public set, so they identify a view rather
    // than a customer's installation or an agent's name.
    case pathname.startsWith('/agent-platform/usage/'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Usage',
        view: parts[3],
      };
      break;
    }

    // The workspace editor: `/agent-platform/workspaces/new`, and
    // `/agent-platform/workspaces/<installation>/<organization>/<name>/edit`,
    // whose segments name a workspace and stay out of the payload. The bare
    // path renders nothing; the list is Customize → Workspaces. Must stay above the
    // generic '/agent-platform' cases below for the reason the profile page
    // gives.
    case pathname === '/agent-platform/workspaces/new':
      payload = { page: 'Create workspace' };
      break;
    case pathname.startsWith('/agent-platform/workspaces/') &&
      /\/edit\/?$/.test(pathname):
      payload = { page: 'Edit workspace' };
      break;
    case pathname === '/agent-platform/workspaces' ||
      pathname.startsWith('/agent-platform/workspaces/'):
      payload = { page: 'Workspaces' };
      break;

    // The shell's minimal "Profile and settings" page: who is signed in, with
    // sign out — the rail's profile menu links here instead of the classic
    // `/settings`. Must stay above the generic '/agent-platform' cases below,
    // or it would report as `page: 'Agents', view: 'profile'`.
    case pathname === '/agent-platform/profile':
      payload = { page: 'Profile' };
      break;

    // The section root renders its first tab, which is Sessions — so this is the
    // same page as '/agent-platform/sessions' above and carries the same name.
    // It moves with the tab order in `agent-platform`'s `plugin.tsx`.
    case pathname === '/agent-platform':
      payload = { page: 'Sessions index' };
      break;

    case pathname.startsWith('/agent-platform'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Agents',
        view: parts.slice(2).join('/'),
      };
      break;
    }

    // `/agents` and below only redirect to the same place under
    // '/agent-platform/agents' (agent-platform's `AgentsRedirect`); the page the
    // visit lands on reports itself right after.
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
