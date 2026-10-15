/**
 * Where an address of the Agent Platform's old URL tree (`/agent-platform/**`,
 * and the older `/agents/**`) lives now: one hop, straight to the final page
 * of the URL tree that follows the rail (giantswarm/giantswarm#38510,
 * "Decisions and plan"). The old tree's own redirects — an index to its
 * Customize tab, a retired view to its successor, an unknown sub-path to the
 * nearest valid parent — are folded in, so no old address takes a second hop.
 *
 * Not wired up yet: the cut-over's `/agent-platform/*` and `/agents/*`
 * catch-alls call it (giantswarm/giantswarm#38573, Prep 3).
 */

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

const AGENT_WIZARD_STEPS = ['skills', 'tools', 'review'];
const AGENT_DETAIL_TABS = ['sessions', 'tools', 'usage'];
const CONNECTOR_WIZARD_STEPS = ['auth', 'verify'];
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

/** Whether `segment` is one of `allowed`, so a tab or step can stay. */
function oneOf(segment: string | undefined, allowed: string[]) {
  return segment !== undefined && allowed.includes(segment);
}

/**
 * Whether a skill page's splat names a repository: `<owner>/<repo>…`, or
 * `-/<host>/<repo path>[/-/<dir…>]` outside github.com. The page sends any
 * other splat to the skill list (`parseSkillDetailPath` in agent-platform's
 * `lib/skills.ts`, mirrored here).
 */
function namesSkillRepository(splat: string[]): boolean {
  if (splat[0] === '-') {
    const [, host, ...rest] = splat;
    const mark = rest.indexOf('-');
    const repoPath = mark === -1 ? rest : rest.slice(0, mark);
    return Boolean(host) && repoPath.length > 0;
  }
  return splat.length >= 2;
}

/** The query without `names`, as `?…` or empty. */
function searchWithout(params: URLSearchParams, ...names: string[]): string {
  const rest = new URLSearchParams(params);
  for (const name of names) {
    rest.delete(name);
  }
  const search = rest.toString();
  return search ? `?${search}` : '';
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
  if (rest[0] === 'new') {
    return path(
      root,
      'new',
      oneOf(rest[1], AGENT_WIZARD_STEPS) ? rest[1] : undefined,
    );
  }
  // The edit wizard's static `edit` outranks the detail route's dynamic
  // installation, but only with its three segments after it: `edit/a/b` is
  // the detail page of an installation named `edit`.
  if (rest[0] === 'edit' && rest.length >= 4) {
    const [, installation, namespace, name, step] = rest;
    return path(
      root,
      installation,
      namespace,
      name,
      'edit',
      oneOf(step, AGENT_WIZARD_STEPS) ? step : undefined,
    );
  }
  if (rest.length < 3) {
    return root;
  }
  const [installation, namespace, name, tab] = rest;
  const agent = path(root, installation, namespace, name);
  // The former `…/<name>/edit`.
  if (tab === 'edit' && rest.length === 4) {
    return `${agent}/edit`;
  }
  // An unknown tab, or anything deeper, is the agent's Overview.
  return rest.length === 4 && oneOf(tab, AGENT_DETAIL_TABS)
    ? `${agent}/${tab}`
    : agent;
}

function skillsTarget(rest: string[]): string {
  const root = '/customize/skills';
  if (rest.length === 0) {
    return root;
  }
  // Only the bare `new` is the add form; `new/<repo>` is a skill of an
  // owner named `new`.
  if (rest.length === 1 && rest[0] === 'new') {
    return `${root}/new`;
  }
  if (rest[0] === 'edit') {
    const splat = rest.slice(1);
    return namesSkillRepository(splat) ? path(root, 'edit', ...splat) : root;
  }
  return namesSkillRepository(rest) ? path(root, ...rest) : root;
}

function connectorsTarget(
  rest: string[],
  params: URLSearchParams,
  defaultInstallation: string,
): LegacyAgentPlatformTarget {
  const root = '/customize/connectors';
  const installation = installationOf(params, defaultInstallation);
  // The list's `?installation=` is the section's scope, and stays one.
  if (rest.length === 0) {
    return { pathname: root, search: searchWithout(params) };
  }
  if (rest[0] === 'new') {
    // The retired review step was the Sign-in step's address before.
    const step = rest[1] === 'review' ? 'auth' : rest[1];
    const knownStep = oneOf(step, CONNECTOR_WIZARD_STEPS) ? step : undefined;
    const edited = params.get('edit')?.trim();
    if (edited) {
      return {
        pathname: path(
          root,
          encodeURIComponent(installation),
          encodeURIComponent(edited),
          'edit',
          knownStep,
        ),
        search: searchWithout(params, 'edit', 'installation'),
      };
    }
    return {
      pathname: path(root, 'new', knownStep),
      search: searchWithout(params),
    };
  }
  const [server, tab, tool] = rest;
  const connector = path(root, encodeURIComponent(installation), server);
  const search = searchWithout(params, 'installation');
  if (tab === 'tools' && tool && rest.length === 3) {
    return { pathname: `${connector}/tools/${tool}`, search };
  }
  // An unknown tab, or anything deeper, is the connector's Tools tab.
  return {
    pathname:
      rest.length === 2 && oneOf(tab, CONNECTOR_TABS)
        ? `${connector}/${tab}`
        : connector,
    search,
  };
}

function workflowsTarget(
  rest: string[],
  params: URLSearchParams,
  defaultInstallation: string,
): LegacyAgentPlatformTarget {
  const root = '/customize/workflows';
  if (rest.length === 0) {
    return { pathname: root, search: searchWithout(params) };
  }
  const [name, tab] = rest;
  const workflow = path(
    root,
    encodeURIComponent(installationOf(params, defaultInstallation)),
    name,
  );
  // An unknown tab, or anything deeper, is the workflow's Overview.
  return {
    pathname:
      rest.length === 2 && oneOf(tab, WORKFLOW_TABS)
        ? `${workflow}/${tab}`
        : workflow,
    search: searchWithout(params, 'installation'),
  };
}

function modelsTarget(
  rest: string[],
  params: URLSearchParams,
): LegacyAgentPlatformTarget {
  const root = '/customize/models';
  const kept = { search: searchWithout(params) };
  // The retired `configs` view: its list, its create flow and one model.
  if (rest[0] === 'configs' && rest.length === 1) {
    return { pathname: root, ...kept };
  }
  if (rest[0] === 'configs' && rest[1] === 'new' && rest.length === 2) {
    return { pathname: `${root}/new`, ...kept };
  }
  if (rest[0] === 'configs' && rest.length === 4) {
    return { pathname: path(root, ...rest.slice(1)), ...kept };
  }
  // One model's former address: three segments, more than any view's.
  if (rest.length === 3) {
    return { pathname: path(root, ...rest), ...kept };
  }
  if (rest.length === 0) {
    return { pathname: root, ...kept };
  }
  if (rest[0] === 'new' && rest.length === 1) {
    return { pathname: `${root}/new`, ...kept };
  }
  if (rest[0] === 'edit' && rest.length === 4) {
    return { pathname: path(root, ...rest.slice(1), 'edit'), ...kept };
  }
  const hosting = `${root}/hosting`;
  const flow = rest.length === 2 ? HOSTING_FLOWS[rest.join('/')] : undefined;
  if (flow) {
    return { pathname: `${hosting}/${flow}`, ...kept };
  }
  if (rest.length === 1 && (rest[0] === 'capacity' || rest[0] === 'cache')) {
    return { pathname: `${hosting}/${rest[0]}`, ...kept };
  }
  // Running models, and any other view, which landed there. An older
  // release's pool link (`?serve=1&…&preset=…`) opened Serve model in
  // place; the view forwarded it to Serve model's page, the preset read as
  // its model.
  if (params.get('serve') === '1') {
    const seed = new URLSearchParams(params);
    seed.delete('serve');
    const preset = seed.get('preset');
    seed.delete('preset');
    if (preset && !seed.get('model')) {
      seed.set('model', preset);
    }
    return { pathname: `${hosting}/serve`, search: searchWithout(seed) };
  }
  return { pathname: hosting, ...kept };
}

function usageTarget(rest: string[]): string {
  if (rest.length !== 1) {
    return '/usage';
  }
  const [view] = rest;
  // `mcp` was the first Connectors view's address. Where muster is not
  // registered, `/usage/connectors` itself shows Overview.
  if (view === 'mcp') {
    return '/usage/connectors';
  }
  // Overview is the bare path now, and every retired or unknown view landed
  // there.
  return oneOf(view, USAGE_VIEWS) ? `/usage/${view}` : '/usage';
}

/**
 * The target of an old Agent Platform address, or undefined for an address
 * outside the old tree (`/customize/**`, `/`, the classic pages), which keeps
 * its place.
 *
 * The query is kept, except what moves into the path: a connector's, tool's
 * or workflow's `?installation=`, and a connector edit's `?edit=`.
 */
export function legacyAgentPlatformTarget(
  pathname: string,
  search: string,
  { defaultInstallation }: LegacyAgentPlatformTargetOptions,
): LegacyAgentPlatformTarget | undefined {
  const segments = pathname.split('/').filter(Boolean);
  const params = new URLSearchParams(search);
  const kept = (target: string) => ({
    pathname: target,
    search: searchWithout(params),
  });

  if (segments[0] === OLDEST_AGENTS_ROOT) {
    return kept(agentsTarget(segments.slice(1)));
  }
  if (segments[0] !== SHELL_ROOT) {
    return undefined;
  }
  const [section, ...rest] = segments.slice(1);
  switch (section) {
    case 'sessions':
      return kept(sessionsTarget(rest));
    case 'agents':
      return kept(agentsTarget(rest));
    case 'skills':
      return kept(skillsTarget(rest));
    case 'connectors':
    case 'mcp-servers':
      return connectorsTarget(rest, params, defaultInstallation);
    case 'workflows':
      return workflowsTarget(rest, params, defaultInstallation);
    case 'models':
      return modelsTarget(rest, params);
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
