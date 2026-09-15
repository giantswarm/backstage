import sha256 from 'crypto-js/sha256';

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

    case pathname === '/agent-platform/muster':
      payload = { page: 'Muster index' };
      break;

    case pathname.startsWith('/agent-platform/muster'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Muster',
        view: parts[3],
      };
      break;
    }

    // Must stay above the generic '/agent-platform' cases below, for the reason
    // the Sessions and Usage cases give: without these the Models tab reports as
    // `page: 'Agents'`, merging its numbers into the Agents page's.
    case pathname === '/agent-platform/models':
      payload = { page: 'Models index' };
      break;

    // One model: `…/models/configs/<installation>/<namespace>/<name>`. No
    // `view`, for the same reason as Session detail and Agent detail: `page`
    // and `view` are the dimensions TelemetryDeck aggregates on, and putting
    // path segments there yields a distinct signal name per model rather than a
    // countable page. (It is not a privacy measure — every payload below
    // carries `path: pathname` verbatim.) Placed above the views case so the
    // three identifying segments cannot reach a `view`.
    case /^\/agent-platform\/models\/configs\/[^/]+\/[^/]+\/[^/]+$/.test(
      pathname,
    ):
      payload = { page: 'Model detail' };
      break;

    // The Models tab's views (`configs`, `serving`, `capacity`). Only the view
    // segment, as the Muster case does, so anything deeper — `configs/new`, and
    // any view that grows sub-paths later — collapses to the view it belongs to
    // instead of opening the dimension up.
    case pathname.startsWith('/agent-platform/models'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Models',
        view: parts[3],
      };
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

    // One agent: `/agent-platform/agents/<installation>/<namespace>/<name>`,
    // optionally followed by one of its tabs. The three identifying segments
    // are kept out of `page` and `view`, for the same reason as Session detail:
    // those are the dimensions TelemetryDeck aggregates on, so a path-shaped
    // value there is a distinct signal name per agent rather than a countable
    // page. It is not a privacy property — every payload below carries
    // `path: pathname` verbatim, so the names are transmitted for this page as
    // for every other one; it is about keeping the dimension bounded.
    //
    // The tab, by contrast, belongs in `view`: `tools`/`skills`/`sessions` is a
    // fixed, public set, so it stays bounded — the same argument the Usage
    // views case makes. Overview is the index and keeps carrying no `view`, so
    // the existing `Agent detail` numbers stay continuous across this split.
    //
    // The tab names are spelled out rather than matched as `[^/]+` so this cannot
    // swallow `…/<name>/edit`, and the three identifying segments are still
    // required so it cannot swallow the create flow's `agents/new`,
    // `agents/new/skills` or `agents/new/review` — all of which keep reporting
    // through the generic case below.
    case /^\/agent-platform\/agents\/[^/]+\/[^/]+\/[^/]+(\/(tools|skills|sessions))?$/.test(
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

    // The edit form for one agent: `…/<installation>/<namespace>/<name>/edit`.
    // A page of its own rather than a view of the detail page — it is a
    // different form with its own funnel — and, like the detail case, it
    // carries no `view`.
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

    // The Usage tab's second-level views (`overview`, `cost`, `conversations`,
    // `mcp`), reported the same way the Muster section's are. The bare path
    // above keeps its existing name rather than becoming 'Usage index': it now
    // only ever redirects here, and renaming it would break continuity in
    // TelemetryDeck for nothing.
    //
    // `view` is safe to include where a session or agent path's segments were
    // not: these four are a fixed, public set, so they identify a view rather
    // than a customer's installation or an agent's name.
    case pathname.startsWith('/agent-platform/usage/'): {
      const parts = pathname.split('/');
      payload = {
        page: 'Usage',
        view: parts[3],
      };
      break;
    }

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

    case pathname === '/roadmap':
      payload = { page: 'Roadmap index' };
      break;

    // One roadmap item: `/roadmap/items/<id>`. No `view`, for the same reason
    // as Plan detail — the varying segment is an opaque item id.
    case pathname.startsWith('/roadmap'):
      payload = { page: 'Roadmap item' };
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
