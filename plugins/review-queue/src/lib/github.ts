/**
 * What the Reviews tab knows about GitHub: the tools it calls on muster's
 * `github` server (GitHub's hosted MCP server), the searches each section
 * runs, and how a PR's checks, reviews and merge state become the three
 * icons of a row. Pure functions; the client and the hooks call them.
 */

/** The server muster exposes GitHub's MCP server as: tools are `x_github_<tool>`. */
export const GITHUB_SERVER = 'github';

/** The organization every search and team belongs to. */
export const GITHUB_ORG = 'giantswarm';

export const GITHUB_TOOLS = {
  searchPullRequests: 'search_pull_requests',
  pullRequestRead: 'pull_request_read',
} as const;

export type GithubTool = (typeof GITHUB_TOOLS)[keyof typeof GITHUB_TOOLS];

/** `x_<server>_<tool>`: how muster exposes an aggregated server's tool. */
export function githubToolName(tool: GithubTool): string {
  return `x_${GITHUB_SERVER}_${tool}`;
}

// --- Answers of the GitHub MCP server ---------------------------------------

export type SearchUser = { login: string; avatar_url?: string };

export type SearchItem = {
  number: number;
  title: string;
  draft?: boolean;
  html_url: string;
  user?: SearchUser | null;
  /** The server answers label names; the REST shape has objects. */
  labels?: (string | { name: string })[];
  created_at: string;
  updated_at: string;
  repository_url: string;
};

export type SearchAnswer = {
  total_count: number;
  incomplete_results?: boolean;
  items: SearchItem[];
};

/** `pull_request_read` `get`: the server's short form of a PR. */
export type PullAnswer = {
  number: number;
  draft?: boolean;
  mergeable_state?: string;
  head?: { sha?: string };
};

export type CheckRun = {
  id: number;
  name: string;
  status: string;
  conclusion?: string | null;
};

export type CheckRunsAnswer = { total_count?: number; check_runs?: CheckRun[] };

export type CommitStatus = { context: string; state: string };

export type CombinedStatusAnswer = {
  state?: string;
  total_count?: number;
  statuses?: CommitStatus[];
};

export type Review = {
  id: number;
  state: string;
  user?: { login: string } | null;
  submitted_at?: string;
};

/** The fields a search asks for; the body, the largest, is left out. */
export const SEARCH_FIELDS = [
  'number',
  'title',
  'draft',
  'html_url',
  'user',
  'labels',
  'created_at',
  'updated_at',
  'repository_url',
] as const;

/** One search page, GitHub's maximum. */
export const SEARCH_PAGE_SIZE = 100;

// --- Rows -------------------------------------------------------------------

export type PrRef = { owner: string; repo: string; number: number };

export type PrRow = PrRef & {
  /** `owner/repo#number`, the row's key everywhere. */
  id: string;
  title: string;
  url: string;
  author: string;
  isBot: boolean;
  draft: boolean;
  labels: string[];
  createdAt: string;
  updatedAt: string;
};

export function prId(ref: PrRef): string {
  return `${ref.owner}/${ref.repo}#${ref.number}`;
}

/** `https://api.github.com/repos/<owner>/<repo>`, else the PR's own URL. */
function repoOf(item: SearchItem): { owner: string; repo: string } {
  const match =
    item.repository_url.match(/\/repos\/([^/]+)\/([^/]+)\/?$/) ??
    item.html_url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\//);
  if (!match) {
    throw new Error(`a search result names no repository: ${item.html_url}`);
  }
  return { owner: match[1], repo: match[2] };
}

/**
 * The bots whose PRs the "Hide bot PRs" filter drops. GitHub Apps sign as
 * `<name>[bot]`; Giant Swarm's own bots are plain user accounts, named as
 * giantswarm/github's team digest names them.
 */
export const BOT_USERS = ['taylorbot', 'architectbot'] as const;

/** The Apps the search leaves out by itself, so they take no slot of the 100. */
export const BOT_APPS = ['renovate', 'dependabot'] as const;

export function isBotLogin(login: string): boolean {
  return (
    login.endsWith('[bot]') || (BOT_USERS as readonly string[]).includes(login)
  );
}

export function rowOf(item: SearchItem): PrRow {
  const { owner, repo } = repoOf(item);
  const author = item.user?.login ?? 'ghost';
  return {
    id: prId({ owner, repo, number: item.number }),
    owner,
    repo,
    number: item.number,
    title: item.title,
    url: item.html_url,
    author,
    isBot: isBotLogin(author),
    draft: Boolean(item.draft),
    labels: (item.labels ?? []).map(label =>
      typeof label === 'string' ? label : label.name,
    ),
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

// --- Sections and their searches --------------------------------------------

export type SectionId = 'waiting' | 'mine' | 'reviewed' | 'team';

export type Filters = {
  hideBots: boolean;
  hideDrafts: boolean;
  orgOnly: boolean;
  hideArchived: boolean;
};

export const DEFAULT_FILTERS: Filters = {
  hideBots: true,
  hideDrafts: true,
  orgOnly: true,
  hideArchived: true,
};

/** The section's own qualifiers, before the filters. */
function sectionQualifiers(section: SectionId, teamSlug?: string): string[] {
  switch (section) {
    case 'waiting':
      return ['review-requested:@me'];
    case 'mine':
      return ['author:@me', '-review:approved'];
    case 'reviewed':
      // Your own PRs are in "My PRs", not here.
      return ['reviewed-by:@me', '-author:@me'];
    case 'team':
      if (!teamSlug) {
        throw new Error('the team section needs a team');
      }
      return [`team-review-requested:${GITHUB_ORG}/${teamSlug}`];
    default:
      throw new Error(`unknown section ${section satisfies never}`);
  }
}

/**
 * The search a section runs. "My PRs" keeps your drafts: a draft of yours is
 * still yours to move on.
 */
export function sectionQuery(
  section: SectionId,
  filters: Filters,
  teamSlug?: string,
): string {
  return qualifiedQuery(sectionQualifiers(section, teamSlug), filters, {
    drafts: section !== 'mine',
  });
}

/**
 * Who a "Waiting on me" request names: you, or one team of yours. GitHub's
 * short form of a PR does not carry its requested reviewers, so the tab asks
 * the same search narrowed to each and tags a row by the searches it is in.
 */
export function requestQuery(
  target: { kind: 'you' } | { kind: 'team'; slug: string },
  filters: Filters,
): string {
  const qualifier =
    target.kind === 'you'
      ? 'user-review-requested:@me'
      : `team-review-requested:${GITHUB_ORG}/${target.slug}`;
  return qualifiedQuery([qualifier], filters, { drafts: true });
}

function qualifiedQuery(
  qualifiers: string[],
  filters: Filters,
  { drafts }: { drafts: boolean },
): string {
  const parts = ['is:open', ...qualifiers];
  if (filters.orgOnly) {
    parts.push(`org:${GITHUB_ORG}`);
  }
  if (filters.hideArchived) {
    parts.push('archived:false');
  }
  if (drafts && filters.hideDrafts) {
    parts.push('draft:false');
  }
  if (filters.hideBots) {
    parts.push(
      ...BOT_APPS.map(app => `-author:app/${app}`),
      ...BOT_USERS.map(user => `-author:${user}`),
    );
  }
  return parts.join(' ');
}

/** The same search on github.com, for "more on GitHub". */
export function githubSearchUrl(query: string): string {
  return `https://github.com/pulls?q=${encodeURIComponent(query)}`;
}

// --- Hive's team scope ------------------------------------------------------

/** Hive's `?team=` value for every team. */
export const ALL_TEAMS = 'all';

/** The team Hive opens on when nothing is chosen (plans' `DEFAULT_TEAM`). */
export const HIVE_DEFAULT_TEAM = 'Bumblebee🐝';

/**
 * Hive's teams, as its header offers them (plans' `HIVE_TEAMS`): the team
 * section under "All teams" runs one search per team.
 */
export const HIVE_TEAMS = [
  HIVE_DEFAULT_TEAM,
  'Atlas 🗺️',
  'Cabbage 🥬',
  'Honey Badger 🦡',
  'Phoenix 🔥',
  'Planeteers 🪐',
  'Shield 🛡️',
  'Up 🎈',
] as const;

/** `Honey Badger 🦡` → `team-honeybadger`: lowercase, letters and digits only. */
export function teamSlugOf(hiveTeam: string): string {
  return `team-${hiveTeam.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')}`;
}

/** `team-honeybadger` → `honeybadger`, for a tag. */
export function teamLabelOf(slug: string): string {
  return slug.replace(/^team-/, '');
}

/**
 * The teams whose queue the team section shows: Hive's scope when it is not
 * one of yours (yours are in "Waiting on me" already), every team under
 * "All teams" but yours.
 */
export function teamSectionSlugs(
  hiveTeam: string,
  ownTeams: readonly string[],
): string[] {
  const scope =
    hiveTeam === ALL_TEAMS
      ? HIVE_TEAMS.map(teamSlugOf)
      : [teamSlugOf(hiveTeam)];
  return scope.filter(slug => !ownTeams.includes(slug));
}

// --- A PR's state -----------------------------------------------------------

export type CiState = 'passing' | 'failing' | 'running' | 'none';
export type ReviewState = 'approved' | 'changes_requested' | 'none';
export type MergeState =
  'ready' | 'conflicts' | 'blocked' | 'behind' | 'draft' | 'checking';

export type PrState = {
  ci: { state: CiState; failing: string[]; running: number; total: number };
  review: { state: ReviewState; approvals: number; changesBy: string[] };
  merge: { state: MergeState; raw: string | undefined };
};

const FAILED_CONCLUSIONS = new Set([
  'failure',
  'timed_out',
  'cancelled',
  'action_required',
  'startup_failure',
]);

/**
 * One state for the PR's CI, from both places GitHub keeps it: check runs
 * (GitHub Actions and Apps) and commit statuses (CircleCI). A re-run leaves
 * the earlier run of a check in the list, so only the latest run of each
 * name counts.
 */
export function ciStateOf(
  checkRuns: readonly CheckRun[],
  statuses: readonly CommitStatus[],
): PrState['ci'] {
  const latest = new Map<string, CheckRun>();
  for (const run of checkRuns) {
    const seen = latest.get(run.name);
    if (!seen || run.id > seen.id) {
      latest.set(run.name, run);
    }
  }
  const checks = [
    ...[...latest.values()].map(run => ({
      name: run.name,
      failed:
        run.status === 'completed' &&
        FAILED_CONCLUSIONS.has(run.conclusion ?? ''),
      running: run.status !== 'completed',
    })),
    ...statuses.map(status => ({
      name: status.context,
      failed: status.state === 'failure' || status.state === 'error',
      running: status.state === 'pending',
    })),
  ];
  const failing = checks.filter(check => check.failed).map(c => c.name);
  const running = checks.filter(check => check.running).length;
  let state: CiState = 'passing';
  if (checks.length === 0) {
    state = 'none';
  } else if (failing.length > 0) {
    state = 'failing';
  } else if (running > 0) {
    state = 'running';
  }
  return { state, failing, running, total: checks.length };
}

/**
 * Each reviewer's latest decision counts, as GitHub counts it: a comment
 * changes nothing, a dismissal takes the decision back.
 */
export function reviewStateOf(reviews: readonly Review[]): PrState['review'] {
  const ordered = [...reviews].sort((a, b) =>
    (a.submitted_at ?? '').localeCompare(b.submitted_at ?? ''),
  );
  const decisions = new Map<string, string>();
  for (const review of ordered) {
    const login = review.user?.login;
    if (!login) {
      continue;
    }
    if (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED') {
      decisions.set(login, review.state);
    } else if (review.state === 'DISMISSED') {
      decisions.delete(login);
    }
  }
  const changesBy = [...decisions]
    .filter(([, state]) => state === 'CHANGES_REQUESTED')
    .map(([login]) => login);
  const approvals = [...decisions.values()].filter(
    state => state === 'APPROVED',
  ).length;
  let state: ReviewState = 'none';
  if (changesBy.length > 0) {
    state = 'changes_requested';
  } else if (approvals > 0) {
    state = 'approved';
  }
  return { state, approvals, changesBy };
}

/**
 * GitHub's `mergeable_state`. It is computed on the first read after a
 * change, so it may come back `unknown` (or not at all): "checking".
 * `unstable` merges (only non-required checks fail; the CI icon says so),
 * as does `has_hooks`.
 */
export function mergeStateOf(raw: string | undefined): PrState['merge'] {
  const states: Record<string, MergeState> = {
    clean: 'ready',
    unstable: 'ready',
    has_hooks: 'ready',
    dirty: 'conflicts',
    blocked: 'blocked',
    behind: 'behind',
    draft: 'draft',
  };
  return { state: (raw && states[raw]) || 'checking', raw };
}

// --- Errors -----------------------------------------------------------------

/**
 * The person's muster session reaches no `github` server yet: the tool is
 * not in the session's tools, or muster asks for the person's sign-in. The
 * per-server sign-in fixes it.
 */
export class GithubNotConnectedError extends Error {
  readonly name = 'GithubNotConnectedError';
}

/** GitHub refuses the person's token for rate until `resetAt`. */
export class GithubRateLimitError extends Error {
  readonly name = 'GithubRateLimitError';

  constructor(
    message: string,
    /** When GitHub serves the token again; undefined when GitHub named no time. */
    readonly resetAt: Date | undefined,
  ) {
    super(message);
  }
}

const NOT_CONNECTED_PATTERNS = [
  /tool not found/i,
  /unknown tool/i,
  /not connected/i,
  /not authenticated/i,
  /auth(entication|orization)? required/i,
  /requires authentication/i,
  /not signed in/i,
  /sign_in_required/i,
  /\b401\b/,
];

function messageOf(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : String(error);
}

/** A Go duration as go-github prints it: `39s`, `1m30s`, `1h2m3.5s`. */
function goDurationMs(text: string): number | undefined {
  const match = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/);
  if (!match || text === '') {
    return undefined;
  }
  const [, h, m, s] = match;
  return ((Number(h ?? 0) * 60 + Number(m ?? 0)) * 60 + Number(s ?? 0)) * 1000;
}

/**
 * GitHub's rate refusals as the MCP server passes them on: go-github's
 * `API rate limit exceeded … [rate reset in 39s]`, and the secondary limit's
 * `You have exceeded a secondary rate limit`.
 */
export function rateLimitOf(
  message: string,
  now: number = Date.now(),
): GithubRateLimitError | undefined {
  if (!/rate limit/i.test(message)) {
    return undefined;
  }
  const reset = message.match(/rate reset in ([\dhms.]+)/i);
  const ms = reset ? goDurationMs(reset[1]) : undefined;
  return new GithubRateLimitError(
    message,
    ms === undefined ? undefined : new Date(now + ms),
  );
}

/** What a tool call threw, as the tab tells the cases apart. */
export function classifyGithubError(error: unknown): Error {
  if (
    error instanceof GithubNotConnectedError ||
    error instanceof GithubRateLimitError
  ) {
    return error;
  }
  const message = messageOf(error);
  const rateLimit = rateLimitOf(message);
  if (rateLimit) {
    return rateLimit;
  }
  if (NOT_CONNECTED_PATTERNS.some(pattern => pattern.test(message))) {
    return new GithubNotConnectedError(message, { cause: error });
  }
  return error instanceof Error ? error : new Error(message);
}
