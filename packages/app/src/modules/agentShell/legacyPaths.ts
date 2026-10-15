import {
  isLegacyServeLink,
  parseServeSeed,
  parseSkillDetailPath,
  serveSeedSearch,
} from '@giantswarm/backstage-plugin-agent-platform';

/**
 * Where an address of the Agent Platform's old URL tree (`/agent-platform/**`,
 * and the older `/agents/**`) lives now: one hop, straight to the final page
 * of the URL tree that follows the rail (giantswarm/giantswarm#38510,
 * "Decisions and plan"). The old tree's own redirects — an index to its
 * Customize tab, a retired view to its successor, an unknown sub-path to the
 * nearest valid parent — are folded in, so no old address takes a second hop.
 *
 * Paths resolve as the old routers ranked them: an exact static route above a
 * dynamic one, a splat last, and every static segment compared
 * case-insensitively, as react-router does.
 *
 * Not wired up yet: the cut-over's `/agent-platform/*` and `/agents/*`
 * catch-alls call it (giantswarm/giantswarm#38573, Prep 3).
 */

/* eslint-disable giantswarm/no-restricted-syntax -- the redirect table of
   the old addresses: it writes the new tree's paths by hand on purpose, a
   snapshot like the old tree's tabs below, and runs outside React, where no
   route ref resolves. */

/** The address an old one redirects to. The caller keeps the hash. */
export type LegacyAgentPlatformTarget = {
  pathname: string;
  /** `?…`, or empty. */
  search: string;
};

export type LegacyAgentPlatformTargetOptions = {
  /**
   * The installation a connector, tool or workflow link without
   * `?installation=` names: the pinned scope, else the home installation —
   * the one the old page fell back to.
   */
  defaultInstallation: string;
};

const SHELL_ROOT = 'agent-platform';
/** The address before `/agent-platform/agents`, redirected there. */
const OLDEST_AGENTS_ROOT = 'agents';

// The old tree's tabs, steps and views, as its routers matched them. A
// snapshot on purpose, not derived from the plugins: the cut-over rewrites
// those routers for the new tree, while this mapping describes only the old
// one, which no longer changes. What both trees read the same way (a skill's
// path, Serve model's seed) comes from agent-platform instead.
const AGENT_WIZARD_STEPS = ['skills', 'tools', 'review'];
const AGENT_DETAIL_TABS = ['sessions', 'tools', 'usage'];
const CONNECTOR_WIZARD_STEPS = ['auth', 'review', 'verify'];
const CONNECTOR_TABS = [
  'resources',
  'prompts',
  'used-by',
  'instances',
  'details',
];
const WORKFLOW_TABS = ['run', 'usage', 'details'];
const USAGE_VIEWS = ['cost', 'conversations', 'connectors'];
const HOSTING_FLOWS: Record<string, string> = {
  'serving/serve': 'serve',
  'serving/import': 'import',
  'serving/pull': 'pull',
  'serving/add-backend': 'add-backend',
  'capacity/add-pool': 'capacity/add-pool',
};

/** `root` and `segments` joined, the empty ones left out. */
function path(root: string, ...segments: (string | undefined)[]): string {
  return [root, ...segments].filter(Boolean).join('/');
}

/** A static segment as the old routers compared it: case-insensitively. */
function key(segment: string | undefined): string | undefined {
  return segment?.toLowerCase();
}

/** The segment as one of `allowed`, so a tab or step can stay; else none. */
function known(
  segment: string | undefined,
  allowed: string[],
): string | undefined {
  const lower = key(segment);
  return lower !== undefined && allowed.includes(lower) ? lower : undefined;
}

/**
 * Whether a skill page's splat names a repository; the page sent any other
 * splat to the skill list. A malformed escape names none.
 */
function namesSkillRepository(splat: string[]): boolean {
  try {
    return parseSkillDetailPath(splat.join('/')) !== undefined;
  } catch {
    return false;
  }
}

/**
 * The query without the parameters `names`, as `?…` or empty. The rest
 * stays as it was written, its encoding included.
 */
function searchWithout(search: string, ...names: string[]): string {
  const kept = search
    .replace(/^\?/, '')
    .split('&')
    .filter(
      pair =>
        pair !== '' &&
        !names.includes(Array.from(new URLSearchParams(pair).keys())[0]),
    );
  return kept.length > 0 ? `?${kept.join('&')}` : '';
}

/** The old address's `?installation=`, else the caller's default. */
function installationOf(params: URLSearchParams, fallback: string): string {
  return params.get('installation')?.trim() || fallback;
}

function sessionsTarget(rest: string[]): string {
  // `<installation>/<sessionId>`; one segment, or anything deeper, is not
  // a session's address.
  const [installation, sessionId] = rest;
  return sessionId ? path('/sessions', installation, sessionId) : '/sessions';
}

function agentsTarget(rest: string[]): string {
  const root = '/customize/agents';
  // The wizard's routes are exact, one or two segments: `new/<a>/<b>` is the
  // detail page of an agent on an installation named `new`.
  if (key(rest[0]) === 'new' && rest.length <= 2) {
    return path(root, 'new', known(rest[1], AGENT_WIZARD_STEPS));
  }
  // The former `…/<name>/edit`, exact, outranks the edit wizard's splat:
  // `edit/a/b/edit` edited the agent `edit/a/b`.
  if (rest.length === 4 && key(rest[3]) === 'edit') {
    return path(root, rest[0], rest[1], rest[2], 'edit');
  }
  // The edit wizard's static `edit` outranks the detail route's dynamic
  // installation, but only with its three segments after it: `edit/a/b` is
  // the detail page of an installation named `edit`. Its steps are exact;
  // an unknown or deeper one is the edit index.
  if (key(rest[0]) === 'edit' && rest.length >= 4) {
    const [, installation, namespace, name, step] = rest;
    return path(
      root,
      installation,
      namespace,
      name,
      'edit',
      rest.length === 5 ? known(step, AGENT_WIZARD_STEPS) : undefined,
    );
  }
  if (rest.length < 3) {
    return root;
  }
  const [installation, namespace, name, tab] = rest;
  // An unknown tab, or anything deeper, is the agent's Overview.
  return path(
    root,
    installation,
    namespace,
    name,
    rest.length === 4 ? known(tab, AGENT_DETAIL_TABS) : undefined,
  );
}

function skillsTarget(rest: string[]): string {
  const root = '/customize/skills';
  if (rest.length === 0) {
    return root;
  }
  // Only the bare `new` is the add form; `new/<repo>` is a skill of an
  // owner named `new`.
  if (rest.length === 1 && key(rest[0]) === 'new') {
    return `${root}/new`;
  }
  if (key(rest[0]) === 'edit') {
    const splat = rest.slice(1);
    return namesSkillRepository(splat) ? path(root, 'edit', ...splat) : root;
  }
  return namesSkillRepository(rest) ? path(root, ...rest) : root;
}

function connectorsTarget(
  rest: string[],
  search: string,
  defaultInstallation: string,
): LegacyAgentPlatformTarget {
  const root = '/customize/connectors';
  const params = new URLSearchParams(search);
  const installation = installationOf(params, defaultInstallation);
  // The list's `?installation=` is the section's scope, and stays one.
  if (rest.length === 0) {
    return { pathname: root, search: searchWithout(search) };
  }
  // The wizard's routes are exact: `new/<anything else>` is the page of a
  // connector named `new`. The retired review step was the Sign-in step.
  const step = rest.length === 2 ? known(rest[1], CONNECTOR_WIZARD_STEPS) : '';
  if (key(rest[0]) === 'new' && rest.length <= 2 && step !== undefined) {
    const wizardStep = step === 'review' ? 'auth' : step;
    const edited = params.get('edit')?.trim();
    if (edited) {
      return {
        pathname: path(
          root,
          encodeURIComponent(installation),
          encodeURIComponent(edited),
          'edit',
          wizardStep,
        ),
        search: searchWithout(search, 'edit', 'installation'),
      };
    }
    return {
      pathname: path(root, 'new', wizardStep),
      search: searchWithout(search),
    };
  }
  const [server, tab, tool] = rest;
  const connector = path(root, encodeURIComponent(installation), server);
  const kept = searchWithout(search, 'installation');
  if (rest.length === 3 && key(tab) === 'tools') {
    return { pathname: path(connector, 'tools', tool), search: kept };
  }
  // An unknown tab, or anything deeper, is the connector's Tools tab.
  return {
    pathname: path(
      connector,
      rest.length === 2 ? known(tab, CONNECTOR_TABS) : undefined,
    ),
    search: kept,
  };
}

function workflowsTarget(
  rest: string[],
  search: string,
  defaultInstallation: string,
): LegacyAgentPlatformTarget {
  const root = '/customize/workflows';
  if (rest.length === 0) {
    return { pathname: root, search: searchWithout(search) };
  }
  const [name, tab] = rest;
  const installation = installationOf(
    new URLSearchParams(search),
    defaultInstallation,
  );
  // An unknown tab, or anything deeper, is the workflow's Overview.
  return {
    pathname: path(
      root,
      encodeURIComponent(installation),
      name,
      rest.length === 2 ? known(tab, WORKFLOW_TABS) : undefined,
    ),
    search: searchWithout(search, 'installation'),
  };
}

const RUNNING_MODELS = '/customize/models/hosting';

function modelsTarget(rest: string[]): string {
  const root = '/customize/models';
  const keys = rest.map(segment => segment.toLowerCase());
  // The retired `configs` view: its list, its create flow and one model.
  if (keys[0] === 'configs') {
    if (rest.length === 1) {
      return root;
    }
    if (rest.length === 2 && keys[1] === 'new') {
      return `${root}/new`;
    }
    if (rest.length === 4) {
      return path(root, ...rest.slice(1));
    }
  }
  // One model's former address: three segments, more than any view's.
  if (rest.length === 3) {
    return path(root, ...rest);
  }
  if (rest.length === 0) {
    return root;
  }
  if (rest.length === 1 && keys[0] === 'new') {
    return `${root}/new`;
  }
  if (rest.length === 4 && keys[0] === 'edit') {
    return path(root, ...rest.slice(1), 'edit');
  }
  const flow = rest.length === 2 ? HOSTING_FLOWS[keys.join('/')] : undefined;
  if (flow) {
    return `${RUNNING_MODELS}/${flow}`;
  }
  if (rest.length === 1 && (keys[0] === 'capacity' || keys[0] === 'cache')) {
    return `${RUNNING_MODELS}/${keys[0]}`;
  }
  // Running models, where any other view landed too.
  return RUNNING_MODELS;
}

function usageTarget(rest: string[]): string {
  if (rest.length !== 1) {
    return '/usage';
  }
  // `mcp` was the first Connectors view's address. Where muster is not
  // registered, `/usage/connectors` itself shows Overview.
  if (key(rest[0]) === 'mcp') {
    return '/usage/connectors';
  }
  // Overview is the bare path now, and every retired or unknown view landed
  // there.
  return path('/usage', known(rest[0], USAGE_VIEWS));
}

/**
 * The target of an old Agent Platform address, or undefined for an address
 * outside the old tree (`/customize/**`, `/`, the classic pages), which keeps
 * its place.
 *
 * The query is kept as it was written, except what moves into the path — a
 * connector's, tool's or workflow's `?installation=`, a connector edit's
 * `?edit=` — and an older release's pool link to Running models
 * (`?serve=1&…`), which becomes Serve model's seed.
 */
export function legacyAgentPlatformTarget(
  pathname: string,
  search: string,
  { defaultInstallation }: LegacyAgentPlatformTargetOptions,
): LegacyAgentPlatformTarget | undefined {
  const segments = pathname.split('/').filter(Boolean);
  const kept = (target: string) => ({
    pathname: target,
    search: searchWithout(search),
  });

  if (key(segments[0]) === OLDEST_AGENTS_ROOT) {
    return kept(agentsTarget(segments.slice(1)));
  }
  if (key(segments[0]) !== SHELL_ROOT) {
    return undefined;
  }
  const [section, ...rest] = segments.slice(1);
  switch (key(section)) {
    case 'sessions':
      return kept(sessionsTarget(rest));
    case 'agents':
      return kept(agentsTarget(rest));
    case 'skills':
      return kept(skillsTarget(rest));
    case 'connectors':
    case 'mcp-servers':
      return connectorsTarget(rest, search, defaultInstallation);
    case 'workflows':
      return workflowsTarget(rest, search, defaultInstallation);
    case 'models': {
      const target = modelsTarget(rest);
      // The Running models view forwarded an older release's pool link to
      // Serve model's page, with the link's seed.
      const params = new URLSearchParams(search);
      if (target === RUNNING_MODELS && isLegacyServeLink(params)) {
        return {
          pathname: `${RUNNING_MODELS}/serve`,
          search: serveSeedSearch(parseServeSeed(params)),
        };
      }
      return kept(target);
    }
    case 'usage':
      return kept(usageTarget(rest));
    case 'profile':
      return kept('/profile');
    default:
      // Bare `/agent-platform`, and a sub-page that never existed, which
      // rendered an empty area under it.
      return kept('/');
  }
}
