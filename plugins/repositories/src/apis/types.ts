/**
 * The shapes giantswarm-repo-manager's read tools return, as the page shows
 * them: `list_repositories` (rows + the last sweep), `get_repository` and
 * `refresh_repository` (the inventory record) and `get_info`. The field
 * names are the tools' own; nothing is renamed on the way.
 */

/** `list_repositories` scope: whose repositories. */
export type Scope = 'mine' | 'team' | 'unassigned' | 'all';

/** The filters of `list_repositories`, as the page offers them. */
export interface ListFilters {
  scope?: Scope;
  search?: string;
  renovate?: 'configured' | 'missing' | 'active' | 'inactive';
  /** A team slug, or `none` for undeclared repositories. */
  team?: string;
  visibility?: 'public' | 'private';
  fork?: boolean;
  /** `deprecated`, `archived`, … or `none`. */
  lifecycle?: string;
  inactiveDays?: number;
  minOrphanScore?: number;
  /** `keep`, or `none`. */
  decision?: string;
  finding?: string;
  limit?: number;
  stalePeriodDays?: number;
}

export interface OrphanScore {
  /** 0-100. */
  score: number;
  reasons: string[];
  /** The stale period the score was judged against (a Go duration). */
  stalePeriod?: string;
}

/** A row's set-up state: the engine's checks and the last reconciler run. */
export interface RepositoryRowSetup {
  /** Absent when the checks could not run (`error` says why). */
  converged?: boolean;
  checkedAt?: string;
  lastRun?: string;
  error?: string;
}

/** One row of `list_repositories`. */
export interface RepositoryRow {
  repository: string;
  team?: string;
  lifecycle?: string;
  visibility?: string;
  archived: boolean;
  gone?: boolean;
  lastPersonCommit?: string;
  orphan: OrphanScore;
  /** Finding kinds. */
  findings?: string[];
  setup: RepositoryRowSetup;
  decision?: string;
  age: string;
}

export interface SweepSummary {
  startedAt: string;
  finishedAt: string;
  duration: string;
  repositories: number;
  declared: number;
  undeclared: number;
  gone: number;
  archived: number;
  engineChecks: number;
  removed: number;
  errors?: string[];
}

/** `list_repositories`'s answer. */
export interface RepositoryListing {
  sweep: SweepSummary | null;
  sweepRunning: boolean;
  total: number;
  matched: number;
  shown: number;
  repositories: RepositoryRow[];
}

/** A finding of the engine or the inventory, with its fix text. */
export interface Finding {
  kind: string;
  message: string;
  fix?: string;
  /** `engine` | `inventory`. */
  source?: string;
}

/** One of the engine's set-up steps (devctl's `reconcile.StepResult`). */
export interface SetupStep {
  step: string;
  /** `ok` | `drift` | `repaired` | `reported` | `skipped` | `failed`. */
  verdict: string;
  summary?: string;
  changes?: string[];
  findings?: Finding[];
}

/** The engine's structured run (devctl's `reconcile.Result`). */
export interface SetupResult {
  repository: string;
  declared: string;
  team: string;
  /** `check` | `repair`. */
  mode: string;
  added: boolean;
  startedAt: string;
  finishedAt: string;
  steps: SetupStep[];
  converged: boolean;
}

export interface Commit {
  date: string;
  author: string;
  message: string;
}

export interface PullRequestRef {
  number: number;
  title: string;
  author: string;
  createdAt: string;
}

/** The full inventory record of one repository (`get_repository`). */
export interface InventoryRecord {
  repository: string;
  name: string;
  /** null: no team file declares it. */
  declaration: {
    team: string;
    file: string;
    componentType?: string;
    lifecycle?: string;
    language?: string;
    flavours?: string[];
    entry: string;
    accepted: boolean;
    problems?: string[];
  } | null;
  /** null: gone from GitHub. */
  reality: {
    url: string;
    description?: string;
    visibility: string;
    defaultBranch?: string;
    isArchived: boolean;
    isFork: boolean;
    isTemplate: boolean;
    isEmpty: boolean;
    createdAt: string;
    pushedAt?: string;
    language?: string;
    topics?: string[];
    lastCommit?: Commit;
    lastPersonCommit?: Commit;
    historySampled: number;
    botCommits: number;
    openPullRequests: {
      total: number;
      people: number;
      bots: number;
      renovate: number;
      oldestBotAt?: string;
      onboarding?: PullRequestRef[];
    };
    openIssues: number;
    latestRelease?: { tag: string; publishedAt: string };
    codeownersTeams?: string[];
    unknownCodeownersTeams?: string[];
    has: Record<string, boolean>;
  } | null;
  circleci?: {
    followed: boolean;
    setupWorkflows?: boolean;
    lastPipeline?: {
      number: number;
      state: string;
      createdAt: string;
      ref?: string;
    };
    error?: string;
  };
  renovate: {
    configured: boolean;
    path?: string;
    enabled: boolean;
    preset: boolean;
    dashboardIssue?: { number: number; title: string };
    lastPullRequest?: PullRequestRef;
    lastCommit?: string;
  };
  catalog: { present: boolean };
  mapping: { present: boolean; team?: string };
  setup: {
    /** The engine's read-mode checks -- what `devctl repo status` prints. */
    checks?: SetupResult;
    checkedAt?: string;
    checkError?: string;
    lastRun?: { result: SetupResult; runUrl: string; timestamp: string };
  };
  orphan: OrphanScore;
  findings: Finding[];
  decision?: { verdict: string; note?: string; by: string; at: string };
  refreshedAt: string;
  /** `sweep` | `refresh` | `reconciler`. */
  source: string;
  age?: string;
}

/** `get_info`: the manager's identity report for this caller. */
export interface ManagerInfo {
  version: string;
  toolPrefix: string;
  caller?: {
    subject?: string;
    email?: string;
    name?: string;
    groups?: string[];
    source?: string;
  } | null;
  github: {
    apiUrl: string;
    grant: {
      obtained: boolean;
      login?: string;
      expiresIn?: string;
      audience?: string;
      reason?: string;
    };
    appError?: string;
    circleciConfigured: boolean;
  };
  inventory: {
    address?: string;
    connected: boolean;
    records: number;
    error?: string;
  };
}

export interface RepositoriesConnectionResponse {
  connected: boolean;
  authUrl?: string;
  message?: string;
}

export interface RepositoriesApi {
  getConnection(): Promise<RepositoriesConnectionResponse>;
  getInfo(): Promise<ManagerInfo>;
  listRepositories(filters: ListFilters): Promise<RepositoryListing>;
  getRepository(
    name: string,
    stalePeriodDays?: number,
  ): Promise<InventoryRecord>;
  refreshRepository(name: string): Promise<InventoryRecord>;
}
