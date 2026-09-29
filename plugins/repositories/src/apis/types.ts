/**
 * The shapes giantswarm-repo-manager's read tools return, as the page shows
 * them: `list_repositories` (rows + the last sweep), `get_repository` and
 * `refresh_repository` (the inventory record) and `get_info`. The field
 * names are the tools' own; nothing is renamed on the way.
 */

/** `list_repositories` scope: whose repositories. */
export type Scope = 'mine' | 'team' | 'unassigned' | 'all';

/**
 * Rows to ask `list_repositories` for when the whole inventory is wanted --
 * the teams and finding kinds of a scope -- above the manager's default of
 * 100.
 */
export const LIST_LIMIT = 2000;

/** The lifecycles `list_repositories` filters by, as the team files declare them. */
export const LIFECYCLES = [
  'active',
  'deprecated',
  'archived',
  'deleted',
] as const;

export type Lifecycle = (typeof LIFECYCLES)[number];

/** The lifecycles `set_lifecycle` sets: the ways a repository's life ends. */
export type LifecycleChange = Exclude<Lifecycle, 'active'>;

/**
 * How a pipeline's images reach the China registry: `split` (the in-China
 * sync job), `inline` (the push job pushes there itself), `custom` (an
 * overridden registry list), `none` (no image push).
 */
export const CHINA_PUSHES = ['split', 'inline', 'custom', 'none'] as const;

export type ChinaPush = (typeof CHINA_PUSHES)[number];

/**
 * Whether a pipeline's images and charts are signed with cosign: `unsigned`
 * comes with the record's reason, `unknown` when the configuration does not
 * say, `none` when nothing is pushed.
 */
export const SIGNINGS = ['signed', 'unsigned', 'unknown', 'none'] as const;

export type Signing = (typeof SIGNINGS)[number];

/**
 * A row's Renovate state, judged when the row is read: `missing` without a
 * configuration, `active` when Renovate opened a pull request or committed
 * within the manager's activity period, else `inactive`.
 */
export type RenovateState = 'missing' | 'active' | 'inactive';

/** The filters of `list_repositories`, as the page offers them. */
export interface ListFilters {
  scope?: Scope;
  search?: string;
  /**
   * A row's state, or `configured`: every repository with a configuration,
   * active or not.
   */
  renovate?: RenovateState | 'configured';
  /**
   * A team slug, or `none` for undeclared repositories. Applies in every
   * scope where it can: under `mine` it narrows to that team when it is one
   * of the caller's; under `unassigned` no row has a team.
   */
  team?: string;
  visibility?: 'public' | 'private';
  /** `true`: forks only; `false`: no forks. */
  fork?: boolean;
  /**
   * `active`: no lifecycle declared and not archived on GitHub;
   * `archived`: declared archived or archived on GitHub; `deprecated`:
   * declared so. Any other value the team-file schema allows is matched
   * against the declared lifecycle.
   */
  lifecycle?: string;
  /**
   * `false` drops every repository that is declared archived or archived on
   * GitHub; `true` keeps only those. Independent of `lifecycle`.
   */
  archived?: boolean;
  /** No commit by a person within this many days, or none at all. */
  inactiveDays?: number;
  /** A finding kind. */
  finding?: string;
  /** An architect orb version, or its prefix: `10` selects every `10.x.y`. */
  orb?: string;
  /** `true`: the pipeline builds linux/arm64 images; `false`: images without it. */
  arm64?: boolean;
  chinaPush?: ChinaPush;
  signing?: Signing;
  limit?: number;
}

/**
 * The CI facts of a row, from the repository's CircleCI configuration:
 * absent from a row without one.
 */
export interface RowCI {
  /** The giantswarm/architect orb version pinned; absent without the orb. */
  orb?: string;
  /** Absent when the configuration does not say. */
  arm64?: boolean;
  chinaPush: ChinaPush;
  signing: Signing;
}

/** A row's set-up state: the engine's checks and the last reconciler run. */
export interface RepositoryRowSetup {
  /** Absent when the checks could not run (`error` says why). */
  converged?: boolean;
  /** The engine refused the entry: no step ran (findings `entry-refused`, `gen-circleci-refused`). */
  refused?: boolean;
  checkedAt?: string;
  /** The last reconciler run's URL. */
  lastRun?: string;
  /** An Align now waiting for its run's artifact. */
  pendingRun?: PendingRun;
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
  fork?: boolean;
  /** Absent when the repository is gone from GitHub. */
  renovate?: RenovateState;
  lastPersonCommit?: string;
  /** Finding kinds. */
  findings?: string[];
  ci?: RowCI;
  setup: RepositoryRowSetup;
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
  /** The manager's remark on the answer: a `team` under `mine` that is not one of the caller's, say. */
  note?: string;
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

/**
 * A commit's `ci/circleci:` statuses -- the default branch head's, or the
 * latest release's tag commit's: whether CircleCI built it.
 */
export interface HeadStatus {
  /** The worst state among the contexts: `failure`, `error`, `pending`, `expected` or `success`. */
  state: string;
  /** The status contexts, `ci/circleci: <job>`, sorted. */
  contexts: string[];
  /** When the newest of them was posted. */
  at: string;
}

/**
 * What the repository's CircleCI configuration on the default branch says
 * (`.circleci/config.yml`, `workflows.yml`, `custom.yml`); absent from a
 * record without one.
 */
export interface CI {
  /** The `.circleci` files found. */
  files: string[];
  /** `config.yml` carries devctl's generator header. */
  generated: boolean;
  /** The giantswarm/architect orb version pinned; absent without the orb. */
  orb?: string;
  imagePush: boolean;
  chartPush: boolean;
  /** The image platforms the push jobs build; absent when the configuration does not say. */
  platforms?: string[];
  /** linux/arm64 among the platforms; absent when the configuration does not say. */
  arm64?: boolean;
  chinaPush: ChinaPush;
  signing: Signing;
  /** Why unsigned: a private repository, `sign: false`, an orb before 8.2.0. */
  signingReason?: string;
  /** A file that did not parse. */
  error?: string;
}

/** The pull request of a team-file change. */
export interface ChangePullRequest {
  number: number;
  url: string;
}

/**
 * The team-file change a reconciler run followed, as the reconciler
 * classifies it: `created`, `added`, `transferred`, `archived`,
 * `deprecated`, `changed` (a person's pull request), `dispatched` (an Align
 * now), `nightly` (the schedule).
 */
export interface Change {
  kind: string;
  /** The pull request's author, or who dispatched the run; absent for the schedule. */
  by?: string;
  pullRequest?: ChangePullRequest;
  /** The giving team of a transfer. */
  fromTeam?: string;
}

/**
 * A reconciler run expected for the repository that has not reported yet:
 * an Align now dispatched, or the run that follows the merge of a team-file
 * pull request. The run's artifact clears it; the pending window running
 * out leaves `MissingRun`.
 */
export interface PendingRun {
  /** The dispatch of an Align now, or the opening of the pull request. */
  dispatchedAt: string;
  /** Who dispatched it, or who opened the pull request. */
  by: string;
  /** `dispatched`, or the kind of the team-file pull request. */
  kind?: string;
  /** The pull request whose merge the run follows; absent for an Align now. */
  pullRequest?: ChangePullRequest;
  /** When the pull request merged: the pending window counts from it. */
  mergedAt?: string;
}

/** An expected run that did not report within the pending window. */
export interface MissingRun extends PendingRun {
  noticedAt: string;
  /** The workflow's Actions page: where the run is, if any. */
  runsUrl: string;
}

/** One reconciler run: the engine's result, the run, when, and the change it followed. */
export interface LastRun {
  result: SetupResult;
  runUrl: string;
  timestamp: string;
  runId?: number;
  attempt?: number;
  /** Absent for an artifact without a change block. */
  change?: Change;
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
    latestRelease?: {
      tag: string;
      publishedAt: string;
      /** The tag commit's CircleCI statuses; absent when it carries none. */
      build?: HeadStatus;
      /** More status contexts than were read, none of them CircleCI's. */
      buildTruncated?: boolean;
    };
    codeownersTeams?: string[];
    unknownCodeownersTeams?: string[];
    has: Record<string, boolean>;
  } | null;
  /** The project's state on CircleCI, from GitHub alone; absent when the repository is gone. */
  circleci?: {
    /** CircleCI builds the repository: statuses on the head, or the reconciler found the project followed. */
    followed: boolean;
    /** From the reconciler's run only; absent until a run tells. */
    setupWorkflows?: boolean;
    /** The default branch head's CircleCI statuses; absent when it has none. */
    head?: HeadStatus;
    /** `statuses` | `artifact` | `statuses+artifact`: the sources that answered. */
    source: string;
    /** The facts no source yields: `followed`, `setupWorkflows`. */
    unknown?: string[];
    /** The reconciler's circleci step failing, as its run reported it. */
    error?: string;
  };
  ci?: CI;
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
    lastRun?: LastRun;
    pendingRun?: PendingRun;
    missingRun?: MissingRun;
  };
  findings: Finding[];
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
  };
  inventory: {
    address?: string;
    connected: boolean;
    records: number;
    error?: string;
  };
  /** Where the inventory's CircleCI facts come from. */
  circleci: {
    /**
     * `statuses+artifact`: the `ci/circleci:` commit statuses and the
     * reconciler's run artifact; the manager holds no CircleCI token.
     */
    source: string;
  };
  /**
   * The vocabulary the manager validates declarations against, read from
   * the repositories schema it embeds; the declaration form offers these
   * values and no others. Absent from a manager that predates it; with
   * `error` and no lists when the schema could not be read.
   */
  schema?: ManagerSchema;
}

/** `get_info`'s `schema`: the enumerated values of a team-file entry. */
export interface ManagerSchema {
  /** Where the schema comes from: `embedded (github.com/giantswarm/devctl/v8 v8.98.1)`. */
  origin: string;
  /** Why the schema could not be read; the lists are absent then. */
  error?: string;
  componentTypes?: string[];
  languages?: string[];
  flavours?: string[];
  visibilities?: string[];
  lifecycles?: string[];
}

export interface RepositoriesConnectionResponse {
  connected: boolean;
  authUrl?: string;
  message?: string;
}

/**
 * A declaration as it goes into a team file: `name`, `componentType`,
 * `gen: {language, flavours}`, `description`, `visibility` and the other
 * fields of the repositories schema. The page passes it to the manager as
 * typed; the schema's verdict comes back as `problems`.
 */
export type DeclarationEntry = { name: string } & Record<string, unknown>;

/** One refusal of the schema or the creation rules, naming the field. */
export interface Problem {
  /** Dotted: `gen.ci.chartName`, `gen.flavours[1]`; `(entry)` for the whole. */
  field: string;
  message: string;
}

/**
 * A guard notice about the change as a whole: `team-review` (the author is
 * outside the owning team and Planeteers), `batch-review` (above three
 * entries), `names-unchecked` (no App to ask GitHub). A notice does not
 * refuse; it says what review the change gets.
 */
export interface Notice {
  kind: string;
  message: string;
}

/** The dry run of one declaration (devctl's `reposetup.Entry`). */
export interface ValidationEntry {
  name: string;
  /** The entry as it would be written, defaults applied (a one-item YAML list). */
  rendered: string;
  /** The template the repository would be scaffolded from; empty when none. */
  template?: string;
  options?: {
    name: string;
    description: string;
    values?: string[];
    default?: string;
  }[];
  /** The GitHub name check: `free`, `taken`, `unchecked`, … with detail. */
  nameCheck: { verdict: string; detail?: string };
  problems?: Problem[];
  accepted: boolean;
}

/**
 * `validate_repository`'s answer, and `create_repository`'s dry run: the
 * engine's result plus who the author is on GitHub, which decides the
 * notices.
 */
export interface Validation {
  team: string;
  mode: string;
  schema: string;
  entries: ValidationEntry[];
  notices?: Notice[];
  /** True when every entry is accepted. */
  accepted: boolean;
  author?: string;
  authorLogin?: string;
  authorTeams?: string[];
  /** Where the author's teams were read: `github`, or `none` (with the reason). */
  teamsSource: string;
  /** The creation-only pull request would be approved by the machine. */
  machineApproved: boolean;
  findings?: Finding[];
  /**
   * The creation as the person would run it, in order: each repository
   * created and scaffolded, then the pull request. Absent without the
   * person's GitHub grant or when an entry is refused.
   */
  creation?: CreationPlan;
}

/** One repository's create and scaffold steps as `validate_repository` plans them. */
export interface RepositoryPlan {
  name: string;
  /** The URL when it exists already: a creation resumed. */
  repository?: string;
  steps: SetupStep[];
}

/**
 * The dry run of `create_repository`'s writes as the person: the engine's
 * create and scaffold steps in check mode, then the declaration pull
 * request -- or the refusal in place of the plan (the org lets only owners
 * create repositories).
 */
export interface CreationPlan {
  /** Why the creation would not run; nothing would be written. */
  refusal?: string;
  repositories?: RepositoryPlan[];
  pullRequest?: PlannedPullRequest;
  /** Entries whose repository exists and the person administers: a creation resumed. */
  resumed?: string[];
}

/** The pull request a write would open, before it exists. */
export interface PlannedPullRequest {
  repository: string;
  branch: string;
  title: string;
  files: string[];
  body: string;
  /** The GitHub login the pull request is opened as. */
  as: string;
}

/** An ask (approval) or notice to a team's channel, before it is posted. */
export interface PlannedMessage {
  team: string;
  /** The Slack channel ID the message goes to. */
  channel?: string;
  /** That channel's name as the team's channel file carries it, for display. */
  channelName?: string;
  text: string;
  deliverable: boolean;
  reason?: string;
}

/** A write's dry run (`update_repository`, `transfer_repository`, `set_lifecycle`). */
export interface Plan {
  repository: string;
  /** The owning team afterwards (the receiving team for a transfer). */
  team: string;
  fromTeam?: string;
  /** The entry before the change, as it reads in the team file. */
  before?: string;
  /** The entry afterwards. */
  entry?: string;
  problems?: Problem[];
  accepted: boolean;
  pullRequest: PlannedPullRequest;
  ask?: PlannedMessage;
  notice?: PlannedMessage;
}

/** The pull request a write opened as the person. */
export interface PullRequest {
  number: number;
  url: string;
  branch: string;
  title: string;
  author?: string;
}

/** What became of an ask or notice. */
export interface Delivery {
  team: string;
  /** The Slack channel ID posted to (the debug channel under a redirect). */
  channel?: string;
  /** The team's channel's name, for display, also under a debug redirect. */
  channelName?: string;
  delivered: boolean;
  reviewId?: string;
  error?: string;
}

/** A write's outcome in `mode: commit`. */
export interface Committed {
  pullRequest: PullRequest | null;
  ask?: Delivery;
  notice?: Delivery;
}

/** One repository after `create_repository`'s create and scaffold steps. */
export interface CreatedRepository {
  name: string;
  /** The URL on GitHub. */
  repository: string;
  /** This call created it; false when it existed already (a creation resumed). */
  created: boolean;
  /** The scaffold commit at the head of the default branch. */
  scaffoldCommit?: string;
  steps: SetupStep[];
}

/**
 * `create_repository`'s outcome in `mode: commit`, in the order it wrote:
 * the repositories created and scaffolded as the person, then the
 * declaration pull request.
 */
export interface Created extends Committed {
  repositories: CreatedRepository[];
  /** Where the first release comes from (the scaffold's push). */
  firstRelease: string;
}

/** A workflow dispatch as the person, planned or done. */
export interface Dispatch {
  workflow: string;
  inputs: Record<string, unknown>;
  /** The GitHub login the dispatch is made as. */
  as: string;
  dispatched: boolean;
  runsUrl: string;
  /** What follows: the completion message in the team's channel. */
  then: string;
  findings?: Finding[];
}

/** The changes one set-up step would apply, as the last check planned them. */
export interface PlannedStep {
  step: string;
  changes: string[];
}

/**
 * The opt-in an Align now performs for a declared repository that has not
 * opted in (`mode: opt-in`): the team-file pull request that sets
 * `align: true` in its entry, planned in the dry run and, after the commit,
 * what the manager committed -- the pull request and the delivered ask.
 */
export interface OptIn {
  plan: Plan;
  committed?: Committed;
}

/**
 * `align_repository`'s answer: what the run does to the repository -- the
 * manager's warning, the repository's opt-in and the changes the last check
 * planned -- and how it lands. `mode: align` dispatches the set-up workflow
 * and applies the planned changes; `mode: check` (no entry) dispatches it
 * and reports them; `mode: opt-in` (declared, not opted in) dispatches
 * nothing: the commit opens the pull request that opts the repository in
 * and the reconciler aligns it when that merges.
 */
export interface Alignment extends Dispatch {
  /** The owning team, when known. */
  team?: string;
  /**
   * The repository's own opt-in to alignment (`align: true` in its team-file
   * entry), as the manager answers it.
   */
  optedIn: boolean;
  mode: 'align' | 'check' | 'opt-in';
  /** The opt-in pull request; present in `mode: opt-in`. */
  optIn?: OptIn;
  /** Per step, the changes the last check planned; absent when no check has run. */
  planned?: PlannedStep[];
  /** When the planned changes were checked. */
  checkedAt?: string;
  /** What an alignment changes on GitHub and CircleCI, in the manager's words. */
  warning: string;
}

/**
 * The phases of a new repository in the order `watch_repository` reaches
 * them: the repository exists, its default branch carries the scaffold, the
 * declaration pull request is open, merged, the reconciler run of that pull
 * request has reported, the first release exists with its CircleCI statuses
 * green, complete and settled.
 */
export const WATCH_PHASES = [
  'created',
  'scaffolded',
  'declared',
  'merged',
  'setUp',
  'released',
] as const;

export type WatchPhaseName = (typeof WATCH_PHASES)[number];

/** One phase done: when it was reached, and the seconds since the phase before. */
export interface WatchPhase {
  name: string;
  at: string;
  seconds: number;
}

/** The phase that failed and why, in the manager's words (a red first release names the job). */
export interface WatchFailure {
  phase: string;
  reason: string;
}

/**
 * `watch_repository`'s answer: the phases done so far, whether the
 * repository is ready, still pending or failed, and why a pending phase
 * could not be decided on the last read.
 */
export interface Watch {
  /** The repository's URL on GitHub. */
  repository: string;
  /** The declaration pull request's URL, once the `declared` phase is done. */
  pullRequest?: string;
  phases: WatchPhase[];
  /** A phase completed during the call that was not done when it started. */
  changed: boolean;
  /** Every phase is done without a failure. */
  ready: boolean;
  /** The phase still waited for when the timeout ran out; absent when ready or failed. */
  pending?: string;
  /**
   * Why the pending phase could not be decided: a read GitHub refused, the
   * release's statuses reported and what is awaited, the settle window;
   * absent when the phase is simply not reached yet.
   */
  pendingReason?: string;
  failure?: WatchFailure;
  /** The first release once it exists. */
  release?: { tag: string; url: string };
  /** The reconciler run's findings for a person, once it has reported. */
  findings?: Finding[];
  /** How many seconds the call blocked. */
  waited: number;
}

/**
 * How a write lands: `dryRun` renders the change and writes nothing;
 * `mode: commit` opens the team-file pull request as the person. The
 * manager owns the modes -- anything else is refused by it with its reason.
 */
export type WriteOptions = { dryRun: true } | { mode: 'commit' };

/** A write's answer: the plan for a dry run, the outcome for a commit. */
export type WriteResult<O extends WriteOptions, TPlan, TCommitted> = O extends {
  dryRun: true;
}
  ? TPlan
  : TCommitted;

export interface DeclarationInput {
  /** The owning team's file, as its GitHub team slug: `team-bumblebee`. */
  team: string;
  entry?: DeclarationEntry;
  entries?: DeclarationEntry[];
  /** Why, for the pull request body. */
  reason?: string;
}

export interface RepositoriesApi {
  getConnection(): Promise<RepositoriesConnectionResponse>;
  getInfo(): Promise<ManagerInfo>;
  listRepositories(filters: ListFilters): Promise<RepositoryListing>;
  getRepository(name: string): Promise<InventoryRecord>;
  refreshRepository(name: string): Promise<InventoryRecord>;
  /**
   * Follows a repository just created to readiness (`watch_repository`):
   * one call blocks until a phase completes, the repository is ready or
   * fails, or `timeout` seconds pass, and answers with the phases reached.
   * Called again while the answer is neither ready nor failed.
   */
  watchRepository(
    name: string,
    args: { pullRequest: number; timeout?: number },
  ): Promise<Watch>;

  /** The dry run of declaring new repositories (`validate_repository`). Writes nothing. */
  validateRepository(input: DeclarationInput): Promise<Validation>;
  /**
   * Creates new repositories as the person: each repository, its scaffold
   * commit, then the creation-only pull request.
   */
  createRepository(
    input: DeclarationInput,
    options: { mode: 'commit' },
  ): Promise<Created>;
  /** Replaces a declared repository's entry (the whole entry). */
  updateRepository<O extends WriteOptions>(
    name: string,
    args: { entry: DeclarationEntry; reason?: string },
    options: O,
  ): Promise<WriteResult<O, Plan, Committed>>;
  /**
   * Declares a repository that exists on GitHub and no team file declares:
   * the entry added to the team's file in a pull request the team reviews.
   * A `lifecycle` in the entry ends the repository's life in the same pull
   * request; the manager adds the opt-in it needs.
   */
  adoptRepository<O extends WriteOptions>(
    name: string,
    args: { team: string; entry: DeclarationEntry; reason?: string },
    options: O,
  ): Promise<WriteResult<O, Plan, Committed>>;
  /** Moves a declared repository to another team. */
  transferRepository<O extends WriteOptions>(
    name: string,
    args: { toTeam: string; reason?: string },
    options: O,
  ): Promise<WriteResult<O, Plan, Committed>>;
  /**
   * Deprecates, archives or deletes a declared repository. A deletion needs
   * `confirm`, the repository's name as the person typed it; the manager
   * refuses it otherwise.
   */
  setLifecycle<O extends WriteOptions>(
    name: string,
    args: { lifecycle: LifecycleChange; reason?: string; confirm?: string },
    options: O,
  ): Promise<WriteResult<O, Plan, Committed>>;
  /**
   * Aligns one repository with its declared set-up now (the set-up workflow
   * dispatched as the person); the dry run says what the run would change.
   */
  alignRepository(
    name: string,
    args: { team?: string },
    options: WriteOptions,
  ): Promise<Alignment>;
}
