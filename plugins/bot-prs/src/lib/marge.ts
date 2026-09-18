/**
 * marge's tool contract, as the portal calls it through muster.
 *
 * marge is the bot PR sweep engine (giantswarm/marge). It serves four MCP
 * tools, and the portal reaches them as the signed-in person through the
 * installation's muster, where they appear as `x_marge_<tool>`. The shapes
 * here mirror `cmd/serve.go` of giantswarm/marge: the portal decides nothing
 * about a PR, it renders what the engine reports and fires the engine's own
 * steps.
 */

/** The MCPServer name muster registers marge under. */
export const MARGE_SERVER = 'marge';

/** The tools this plugin calls, by their marge name. */
export const MARGE_TOOLS = {
  list: 'list',
  sweep: 'sweep',
  remedy: 'remedy',
  mark: 'mark',
} as const;

export type MargeTool = (typeof MARGE_TOOLS)[keyof typeof MARGE_TOOLS];

/** `x_<server>_<tool>`: how muster exposes an aggregated server's tool. */
export function margeToolName(tool: MargeTool): string {
  return `x_${MARGE_SERVER}_${tool}`;
}

/**
 * The `tool` a mark written from this page names as the one that gave up on
 * the PR. The engine's default, `ai`, describes a rescue agent; a person who
 * marks a PR blocked here is not one.
 */
export const MARGE_MARK_TOOL = 'developer-portal';

/**
 * The sweep's steps, in the engine's fixed order (`process.AllActions`).
 * `classify` is implied on every run and `mark` writes the evidence comment
 * that attributes a step to the caller, so neither is a choice on the page.
 */
export const SWEEP_STEPS = [
  {
    id: 'approve',
    label: 'Approve',
    description:
      'Approve the green PRs whose update type the team policy merges: patch and minor by default, never a major.',
  },
  {
    id: 'merge',
    label: 'Merge',
    description:
      'Squash-merge the approved green PRs. A pending or unreported required check is a wait, never a bypass; a failing security check is never merged past.',
  },
  {
    id: 'refresh',
    label: 'Refresh branches',
    description:
      'Update a stale branch from its base when every failing check is green on the base branch head, so CI runs again.',
  },
  {
    id: 'retry',
    label: 'Retry CI',
    description:
      'Rerun the CircleCI workflow of a build CircleCI itself cancelled, on the same commit.',
  },
  {
    id: 'remedy',
    label: 'Remedy',
    description:
      'Apply the catalogue rule that matches a failure, through the action the rule names and under that action’s own guards: a rerun, a branch update, a close. No matching rule writes nothing.',
  },
] as const;

export type SweepStep = (typeof SWEEP_STEPS)[number]['id'];

/** The `actions` argument for a set of steps: the steps plus `mark`. */
export function actionsArgument(steps: readonly SweepStep[]): string {
  return [...steps, 'mark'].join(',');
}

/**
 * The per-PR actions of the page, each one sweep step narrowed to the PR.
 * Merge carries approve with it, because the engine merges only what it has
 * approved. Remedy and Mark blocked are their own tools and not listed here.
 */
export const PR_ACTIONS = [
  { id: 'approve', label: 'Approve', steps: ['approve'] },
  { id: 'merge', label: 'Merge', steps: ['approve', 'merge'] },
  { id: 'refresh', label: 'Refresh branch', steps: ['refresh'] },
  { id: 'retry', label: 'Retry CI', steps: ['retry'] },
] as const satisfies readonly {
  id: string;
  label: string;
  steps: readonly SweepStep[];
}[];

export type PrSweepAction = (typeof PR_ACTIONS)[number]['id'];

/** The resolved policy a PR was decided under (`SweepPolicyInfo`). */
export type MargePolicy = {
  sweep: boolean;
  update_types: Record<string, string[]>;
  rescue: {
    enabled: boolean;
    timeout?: string;
    weekly: number;
    budget_per_rescue_usd?: number;
    budget_weekly_usd?: number;
    budget_enforced: boolean;
    rescues_dispatched: boolean;
    /** `per-pr` or `per-sweep`: who confirms before the engine acts. */
    confirm?: string;
  };
  concurrency: { per_team: number; per_repo: number };
  model_config?: string;
  slack_channel?: string;
  sources?: string[];
};

/** The most recent prior rescue attempt recorded on a PR (`SweepRescueInfo`). */
export type MargeRescue = {
  tool?: string;
  outcome: string;
  reason?: string;
  at?: string;
  /** The PR content changed since the attempt: it no longer describes the code. */
  stale: boolean;
  /** The head moved but the change did not (a Renovate rebase). */
  rebased: boolean;
};

/** One PR in a sweep result (`SweepPREntry`). */
export type MargeEntry = {
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  /** The engine's state, as `StatusState.String()` renders it. */
  status: string;
  /** The last evidence line: why the PR is in this state. */
  detail?: string;
  /** The bot that authored the PR. */
  kind?: string;
  /** The size of the update; absent on a stored read. */
  update_type?: string;
  /** The `marge/<class>` label on the PR. */
  label?: string;
  created_at?: string;
  age_days?: number;
  rescue?: MargeRescue;
  /** Why an obsolete PR is obsolete: `superseded` or `no_op`. */
  reason?: string;
  policy?: MargePolicy;
};

/** The lists a sweep result groups its entries into, in the engine's order. */
export const MARGE_GROUPS = [
  'merged',
  'auto_merge',
  'remedied',
  'security_failures',
  'action_required',
  'eligible',
  'unclassified',
  'stale',
  'refreshed',
  'cancelled',
  'retried',
  'ci_unavailable',
  'ci_no_verdict',
  'obsolete',
  'waiting',
  'skipped',
] as const;

export type MargeGroup = (typeof MARGE_GROUPS)[number];

export type MargeSummary = {
  total: number;
  merged: number;
  auto_merge: number;
  remedied: number;
  failed: number;
  security_failures: number;
  ci_unavailable: number;
  ci_no_verdict: number;
  stale: number;
  refreshed: number;
  cancelled: number;
  retried: number;
  obsolete: number;
  waiting: number;
  skipped: number;
  eligible: number;
  unclassified: number;
};

export type MargeRules = {
  source: string;
  ref?: string;
  digest?: string;
  loaded: number;
  skipped?: { path: string; reason: string }[];
  error?: string;
};

export type MargeUnhandled = {
  signature: string;
  checks: string[];
  count: number;
  prs: string[];
  excerpt?: string;
};

/** What `list`, `sweep` and `remedy` answer (`SweepResult`). */
export type MargeResult = Partial<Record<MargeGroup, MargeEntry[]>> & {
  summary: MargeSummary;
  rules?: MargeRules;
  unhandled?: MargeUnhandled[];
  repositories_failed?: { repo: string; error: string }[];
};

/** What `mark` answers: the marker it wrote, or would write. */
export type MargeMarkResult = {
  owner: string;
  repo: string;
  number: number;
  outcome: string;
  tool: string;
  head_sha: string;
  at: string;
  dry_run: boolean;
  patch_id?: string;
  change_id?: string;
};

/** One row of the page: an entry plus the list the engine filed it under. */
export type BotPrRow = MargeEntry & {
  /** The row's identity for the table: the same as `ref`. */
  id: string;
  /** The team whose queue the PR came from, and whose policy decides it. */
  team: string;
  group: MargeGroup;
  /** `owner/repo`. */
  repository: string;
  /** `owner/repo#number`, the reference every tool accepts. */
  ref: string;
  /** The dependency the PR updates, read from its title; the title otherwise. */
  dependency: string;
};

/** Every entry of a result as one flat list, in the engine's group order. */
export function rowsOf(
  result: MargeResult | undefined,
  team: string = '',
): BotPrRow[] {
  if (!result) {
    return [];
  }
  const rows: BotPrRow[] = [];
  for (const group of MARGE_GROUPS) {
    for (const entry of result[group] ?? []) {
      const ref = `${entry.owner}/${entry.repo}#${entry.number}`;
      rows.push({
        ...entry,
        id: ref,
        team,
        group,
        repository: `${entry.owner}/${entry.repo}`,
        ref,
        dependency: dependencyOf(entry.title),
      });
    }
  }
  return rows;
}

/**
 * The dependency a bot PR updates, as the bots title them: Renovate's
 * `Update dependency X to v2` / `Update X Docker tag to v2` / `Update module
 * X to v2` / `Update vendir X to v2` / `Update ocm component X to v2`, Dependabot's `Bump X from 1 to 2`, with or without a conventional
 * `chore(deps):` prefix. A title neither shape matches groups under itself,
 * so an Align files or Herald PR forms a group of one.
 */
export function dependencyOf(title: string): string {
  const text = title.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, '').trim();
  const renovate = text.match(
    /^update\s+(?:(?:dependency|module|helm release|plugin|vendir|ocm component|github action)\s+)?(.+?)(?:\s+(?:docker tag|action|digest|orb))?\s+to\s+\S+/i,
  );
  if (renovate) {
    return renovate[1];
  }
  const dependabot = text.match(/^bump\s+(.+?)\s+from\s+\S+/i);
  if (dependabot) {
    return dependabot[1];
  }
  return text || title;
}

/**
 * The confirm mode the team's policy asks for, read off the entries of a
 * result: `per-pr` means every PR is confirmed on its own, `per-sweep` that
 * one confirmation covers the run. The engine's company default is `per-pr`,
 * and a stored read carries no policy, so that is also what an unknown reads
 * as.
 */
export type ConfirmMode = 'per-pr' | 'per-sweep';

export function confirmModeOf(result: MargeResult | undefined): ConfirmMode {
  for (const row of rowsOf(result)) {
    if (row.policy?.rescue?.confirm === 'per-sweep') {
      return 'per-sweep';
    }
    if (row.policy?.rescue?.confirm === 'per-pr') {
      return 'per-pr';
    }
  }
  return 'per-pr';
}

/**
 * The marge team a catalogue group stands for. Giant Swarm's groups are named
 * `team-<name>` and marge's team files `team-<name>.yaml`, so the team is the
 * group name without the prefix; a group without the prefix is offered as it
 * is, and marge says whether a team file exists for it.
 */
export function teamOfGroupRef(entityRef: string): string | undefined {
  const match = entityRef.match(/^group:(?:[^/]+\/)?(.+)$/i);
  if (!match) {
    return undefined;
  }
  const name = match[1];
  return name.startsWith('team-') ? name.slice('team-'.length) : name;
}

/**
 * How a status reads on the page, and what kind of state it is.
 * `positive`: the engine merged or handed the PR on; `warning`: a person or
 * the next sweep decides; `negative`: something failed; `info`: in flight;
 * `neutral`: nothing is known.
 */
export type StatusIntent =
  'positive' | 'warning' | 'negative' | 'info' | 'neutral';

export function statusIntentOf(group: MargeGroup): StatusIntent {
  switch (group) {
    case 'merged':
    case 'auto_merge':
    case 'remedied':
    case 'refreshed':
    case 'retried':
    case 'eligible':
      return 'positive';
    case 'security_failures':
    case 'action_required':
      return 'negative';
    case 'stale':
    case 'cancelled':
    case 'obsolete':
    case 'ci_unavailable':
    case 'ci_no_verdict':
      return 'warning';
    case 'waiting':
      return 'info';
    case 'unclassified':
    case 'skipped':
    default:
      return 'neutral';
  }
}

/**
 * muster's answers when the session is not connected to a server -- the
 * patterns gs-node's `looksNotConnected` matches on the backend -- plus
 * marge's own refusals of a call without a grant: "not signed in" when the
 * bearer is missing, "authentication required: server returned 401
 * Unauthorized" when GitHub rejects it.
 */
const NOT_CONNECTED_PATTERNS = [
  /tool not found/i,
  /unknown tool/i,
  /not connected/i,
  /not authenticated/i,
  /auth(entication|orization)? required/i,
  /requires authentication/i,
  /not signed in/i,
  /\b401\b/,
];

export function looksNotConnected(message: string): boolean {
  return NOT_CONNECTED_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * The person's muster session holds no connection to marge yet: the tool is
 * not in the session's tool set, or marge refused the call without a grant.
 * The per-server sign-in fixes it.
 */
export class MargeNotConnectedError extends Error {
  readonly name = 'MargeNotConnectedError';
}

/** What a tool call threw, as the page tells the two cases apart. */
export function classifyMargeError(error: unknown): Error {
  if (error instanceof MargeNotConnectedError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (looksNotConnected(message)) {
    return new MargeNotConnectedError(message);
  }
  return error instanceof Error ? error : new Error(message);
}

/**
 * marge answers this for a team it has no policy file for: `no team file for
 * "x": giantswarm/github@main has no team/x.yaml, or it cannot be read`
 * (internal/policy/load.go). The catalog names the team, giantswarm/github
 * does not, which is a gap to report once, not a refusal per team.
 */
const UNKNOWN_TEAM_PATTERN = /no team file for/i;

export function looksUnknownTeam(error: Error | null | undefined): boolean {
  return Boolean(error) && UNKNOWN_TEAM_PATTERN.test(error!.message);
}
