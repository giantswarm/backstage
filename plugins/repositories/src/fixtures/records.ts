import {
  Alignment,
  Committed,
  Created,
  InventoryRecord,
  ManagerSchema,
  Plan,
  PullRequest,
  RenovateState,
  RepositoryListing,
  RepositoryRow,
  SweepSummary,
  Validation,
  Watch,
  WATCH_PHASES,
  WatchPhaseName,
} from '../apis';

/**
 * `get_info`'s `schema`, as giantswarm-repo-manager reports the repositories
 * schema it embeds: the vocabulary the form offers and the in-memory
 * validator judges against.
 */
export const schema: ManagerSchema = {
  componentTypes: [
    'appcatalog',
    'cli',
    'configuration',
    'customer',
    'library',
    'service',
    'template',
    'unspecified',
  ],
  flavours: [
    'app',
    'cli',
    'cluster-app',
    'customer',
    'fleet',
    'fork',
    'generic',
    'k8sapi',
    'plans',
  ],
  languages: ['generic', 'go', 'node', 'python', 'kyverno-policy'],
  lifecycles: ['archived', 'deleted', 'deprecated', 'production'],
  origin: 'embedded (github.com/giantswarm/devctl/v8 v8.98.1)',
  visibilities: ['private', 'public'],
};

/**
 * Inventory records in the shape giantswarm-repo-manager stores them
 * (`docs/inventory-record.md`), over two teams: a declared repository whose
 * set-up converged (a generated pipeline on a current orb: arm64, split
 * China push, signed), one being created whose set-up has not, an undeclared
 * one, a deprecated one (a hand-maintained pipeline on an old orb: amd64
 * only, inline China push, unsigned), one declared archived, and an
 * undeclared fork that GitHub archived. The tests render the page over these
 * through `inMemoryApi`; the dev app shows the same rows.
 */

export const presentService: InventoryRecord = {
  repository: 'giantswarm/present-service',
  name: 'present-service',
  declaration: {
    team: 'team-bumblebee',
    file: 'repositories/team-bumblebee.yaml',
    componentType: 'service',
    language: 'go',
    flavours: ['app'],
    entry: '- name: present-service\n  componentType: service\n',
    accepted: true,
  },
  reality: {
    url: 'https://github.com/giantswarm/present-service',
    description: 'Serves the present',
    visibility: 'public',
    defaultBranch: 'main',
    isArchived: false,
    isFork: false,
    isTemplate: false,
    isEmpty: false,
    createdAt: '2024-01-10T09:00:00Z',
    pushedAt: '2026-09-15T08:00:00Z',
    language: 'Go',
    lastCommit: {
      date: '2026-09-15T08:00:00Z',
      author: 'renovate',
      message: 'chore(deps): update module',
    },
    lastPersonCommit: {
      date: '2026-09-12T10:30:00Z',
      author: 'alice',
      message: 'Serve the present',
    },
    historySampled: 30,
    botCommits: 12,
    openPullRequests: { total: 2, people: 1, bots: 1, renovate: 1 },
    openIssues: 1,
    latestRelease: {
      tag: 'v1.0.0',
      publishedAt: '2026-09-01T12:00:00Z',
      build: {
        state: 'success',
        contexts: [
          'ci/circleci: push-to-app-catalog-release',
          'ci/circleci: push-to-registries-release',
        ],
        at: '2026-09-01T11:58:00Z',
      },
    },
    codeownersTeams: ['team-bumblebee'],
    has: {
      renovate: true,
      dependabot: false,
      circleci: true,
      workflows: true,
      dockerfile: true,
      helm: true,
      readme: true,
      codeowners: true,
    },
  },
  circleci: {
    followed: true,
    setupWorkflows: true,
    head: {
      state: 'success',
      contexts: ['ci/circleci: go-build', 'ci/circleci: push-to-registries'],
      at: '2026-09-15T08:05:00Z',
    },
    source: 'statuses+artifact',
  },
  ci: {
    files: ['config.yml', 'workflows.yml', 'custom.yml'],
    generated: true,
    orb: '10.5.0',
    imagePush: true,
    chartPush: true,
    platforms: ['linux/amd64', 'linux/arm64'],
    arm64: true,
    chinaPush: 'split',
    signing: 'signed',
  },
  renovate: {
    configured: true,
    path: 'renovate.json5',
    enabled: true,
    preset: true,
    dashboardIssue: { number: 3, title: 'Dependency Dashboard' },
    lastPullRequest: {
      number: 10,
      title: 'chore(deps): update module',
      author: 'renovate',
      createdAt: '2026-09-15T07:00:00Z',
    },
  },
  catalog: { present: true },
  mapping: { present: true, team: 'bumblebee' },
  setup: {
    checks: {
      repository: 'giantswarm/present-service',
      declared: 'present-service',
      team: 'team-bumblebee',
      mode: 'check',
      added: false,
      startedAt: '2026-09-16T22:00:00Z',
      finishedAt: '2026-09-16T22:00:04Z',
      steps: [
        { step: 'settings', verdict: 'ok', summary: 'settings match' },
        { step: 'permissions', verdict: 'ok' },
        { step: 'protection', verdict: 'ok', summary: 'main protected' },
        { step: 'circleci', verdict: 'ok', summary: 'followed' },
        { step: 'renovate', verdict: 'ok' },
        { step: 'codeowners', verdict: 'ok' },
        {
          step: 'metadata',
          verdict: 'reported',
          summary: 'default icon',
          findings: [
            {
              kind: 'default-icon',
              message: 'the repository uses the default icon',
              fix: 'upload an icon in the repository settings',
            },
          ],
        },
        { step: 'lifecycle', verdict: 'skipped', summary: 'no lifecycle set' },
        { step: 'catalog', verdict: 'ok' },
        { step: 'release', verdict: 'ok', summary: 'v1.0.0 green' },
      ],
      converged: true,
    },
    checkedAt: '2026-09-16T22:00:04Z',
    lastRun: {
      result: {
        repository: 'giantswarm/present-service',
        declared: 'present-service',
        team: 'team-bumblebee',
        mode: 'repair',
        added: false,
        startedAt: '2026-09-10T22:00:00Z',
        finishedAt: '2026-09-10T22:00:09Z',
        steps: [{ step: 'settings', verdict: 'repaired' }],
        converged: true,
      },
      runUrl: 'https://github.com/giantswarm/github/actions/runs/123',
      timestamp: '2026-09-10T22:00:09Z',
    },
  },
  findings: [
    {
      kind: 'default-icon',
      message: 'the repository uses the default icon',
      fix: 'upload an icon in the repository settings',
      source: 'engine',
    },
  ],
  refreshedAt: '2026-09-16T22:00:04Z',
  source: 'sweep',
  age: '5m3s',
};

/** A repository declared minutes ago: created, the rest of the set-up pending. */
export const newService: InventoryRecord = {
  repository: 'giantswarm/new-service',
  name: 'new-service',
  declaration: {
    team: 'team-bumblebee',
    file: 'repositories/team-bumblebee.yaml',
    componentType: 'service',
    language: 'go',
    // Created through the product: opted in to alignment by its creation.
    entry: '- name: new-service\n  align: true\n',
    accepted: true,
  },
  reality: {
    url: 'https://github.com/giantswarm/new-service',
    visibility: 'private',
    isArchived: false,
    isFork: false,
    isTemplate: false,
    isEmpty: true,
    createdAt: '2026-09-16T21:58:00Z',
    historySampled: 0,
    botCommits: 0,
    openPullRequests: { total: 0, people: 0, bots: 0, renovate: 0 },
    openIssues: 0,
    has: {},
  },
  renovate: { configured: false, enabled: false, preset: false },
  catalog: { present: false },
  mapping: { present: false },
  setup: {
    checks: {
      repository: 'giantswarm/new-service',
      declared: 'new-service',
      team: 'team-bumblebee',
      mode: 'check',
      added: true,
      startedAt: '2026-09-16T22:00:00Z',
      finishedAt: '2026-09-16T22:00:02Z',
      steps: [
        { step: 'create', verdict: 'ok', summary: 'created' },
        { step: 'scaffold', verdict: 'drift', summary: 'template not applied' },
        { step: 'settings', verdict: 'drift' },
        { step: 'circleci', verdict: 'drift', changes: ['follow project'] },
        {
          step: 'renovate',
          verdict: 'reported',
          findings: [
            {
              kind: 'renovate-missing',
              message: 'no renovate.json5',
              fix: 'the scaffold adds one; wait for the reconciler',
            },
          ],
        },
      ],
      converged: false,
    },
    checkedAt: '2026-09-16T22:00:02Z',
  },
  findings: [
    {
      kind: 'renovate-missing',
      message: 'no renovate.json5',
      fix: 'the scaffold adds one; wait for the reconciler',
      source: 'engine',
    },
  ],
  refreshedAt: '2026-09-16T22:00:02Z',
  source: 'refresh',
  age: '12s',
};

/** On GitHub, declared by nobody. */
export const strayTool: InventoryRecord = {
  repository: 'giantswarm/stray-tool',
  name: 'stray-tool',
  declaration: null,
  reality: {
    url: 'https://github.com/giantswarm/stray-tool',
    description: 'A tool somebody forked and forgot',
    visibility: 'public',
    language: 'Go',
    isArchived: false,
    isFork: true,
    isTemplate: false,
    isEmpty: false,
    createdAt: '2021-03-01T00:00:00Z',
    historySampled: 30,
    botCommits: 0,
    lastPersonCommit: {
      date: '2023-05-01T00:00:00Z',
      author: 'bob',
      message: 'initial',
    },
    openPullRequests: { total: 0, people: 0, bots: 0, renovate: 0 },
    openIssues: 0,
    has: { readme: true },
  },
  renovate: { configured: false, enabled: false, preset: false },
  catalog: { present: false },
  mapping: { present: false },
  setup: { checkError: 'no declaration: the set-up checks need a team' },
  findings: [
    {
      kind: 'undeclared-on-github',
      message: 'on GitHub without a declaration',
      fix: 'declare it in a team file or archive it',
      source: 'inventory',
    },
  ],
  refreshedAt: '2026-09-16T21:00:00Z',
  source: 'sweep',
  age: '1h5m3s',
};

/** Another team's repository, declared deprecated; Renovate configured but idle. */
export const legacyTool: InventoryRecord = {
  repository: 'giantswarm/legacy-tool',
  name: 'legacy-tool',
  declaration: {
    team: 'team-planeteers',
    file: 'repositories/team-planeteers.yaml',
    componentType: 'tool',
    lifecycle: 'deprecated',
    language: 'go',
    flavours: ['cli'],
    entry:
      '- name: legacy-tool\n  componentType: tool\n  lifecycle: deprecated\n',
    accepted: true,
  },
  reality: {
    url: 'https://github.com/giantswarm/legacy-tool',
    description: 'Superseded by present-service',
    visibility: 'public',
    defaultBranch: 'main',
    isArchived: false,
    isFork: false,
    isTemplate: false,
    isEmpty: false,
    createdAt: '2020-06-01T00:00:00Z',
    pushedAt: '2025-11-02T09:00:00Z',
    language: 'Go',
    lastCommit: {
      date: '2025-11-02T09:00:00Z',
      author: 'carol',
      message: 'Point at present-service',
    },
    lastPersonCommit: {
      date: '2025-11-02T09:00:00Z',
      author: 'carol',
      message: 'Point at present-service',
    },
    historySampled: 30,
    botCommits: 4,
    openPullRequests: { total: 3, people: 0, bots: 3, renovate: 3 },
    openIssues: 0,
    latestRelease: { tag: 'v0.9.0', publishedAt: '2025-06-01T12:00:00Z' },
    codeownersTeams: ['team-planeteers'],
    has: { renovate: true, circleci: true, readme: true, codeowners: true },
  },
  circleci: {
    followed: true,
    setupWorkflows: false,
    head: {
      state: 'failure',
      contexts: ['ci/circleci: build'],
      at: '2025-11-02T09:04:00Z',
    },
    source: 'statuses+artifact',
  },
  // A hand-maintained pipeline on an old orb: amd64 only, pushed to China
  // by the push job itself, unsigned; the tag commit carries no statuses.
  ci: {
    files: ['config.yml'],
    generated: false,
    orb: '6.3.0',
    imagePush: true,
    chartPush: false,
    platforms: ['linux/amd64'],
    arm64: false,
    chinaPush: 'inline',
    signing: 'unsigned',
    signingReason: 'an orb before 8.2.0',
  },
  renovate: {
    configured: true,
    path: 'renovate.json5',
    enabled: true,
    preset: true,
    lastPullRequest: {
      number: 88,
      title: 'chore(deps): update module',
      author: 'renovate',
      createdAt: '2025-12-01T07:00:00Z',
    },
  },
  catalog: { present: true },
  mapping: { present: true, team: 'planeteers' },
  setup: {
    checks: {
      repository: 'giantswarm/legacy-tool',
      declared: 'legacy-tool',
      team: 'team-planeteers',
      mode: 'check',
      added: false,
      startedAt: '2026-09-16T22:00:00Z',
      finishedAt: '2026-09-16T22:00:03Z',
      steps: [
        { step: 'settings', verdict: 'ok' },
        { step: 'protection', verdict: 'ok' },
        {
          step: 'lifecycle',
          verdict: 'ok',
          summary: 'deprecated: description says so, no new issues',
        },
        { step: 'catalog', verdict: 'ok' },
      ],
      converged: true,
    },
    checkedAt: '2026-09-16T22:00:03Z',
  },
  findings: [
    {
      kind: 'renovate-inactive',
      message: 'the last Renovate pull request is from 2025-12-01',
      fix: 'merge or close the open Renovate pull requests, or archive the repository',
      source: 'inventory',
    },
  ],
  refreshedAt: '2026-09-16T22:00:03Z',
  source: 'sweep',
  age: '5m4s',
};

/** Declared archived; GitHub agrees. */
export const oldOperator: InventoryRecord = {
  repository: 'giantswarm/old-operator',
  name: 'old-operator',
  declaration: {
    team: 'team-planeteers',
    file: 'repositories/team-planeteers.yaml',
    componentType: 'service',
    lifecycle: 'archived',
    entry:
      '- name: old-operator\n  componentType: service\n  lifecycle: archived\n',
    accepted: true,
  },
  reality: {
    url: 'https://github.com/giantswarm/old-operator',
    visibility: 'public',
    defaultBranch: 'master',
    isArchived: true,
    isFork: false,
    isTemplate: false,
    isEmpty: false,
    createdAt: '2018-02-01T00:00:00Z',
    pushedAt: '2022-01-10T10:00:00Z',
    language: 'Go',
    lastPersonCommit: {
      date: '2022-01-10T10:00:00Z',
      author: 'dave',
      message: 'Archive',
    },
    historySampled: 30,
    botCommits: 0,
    openPullRequests: { total: 0, people: 0, bots: 0, renovate: 0 },
    openIssues: 0,
    has: { readme: true },
  },
  renovate: { configured: false, enabled: false, preset: false },
  catalog: { present: false },
  mapping: { present: true, team: 'planeteers' },
  setup: {
    checks: {
      repository: 'giantswarm/old-operator',
      declared: 'old-operator',
      team: 'team-planeteers',
      mode: 'check',
      added: false,
      startedAt: '2026-09-16T22:00:00Z',
      finishedAt: '2026-09-16T22:00:01Z',
      steps: [
        { step: 'lifecycle', verdict: 'ok', summary: 'archived on GitHub' },
        { step: 'settings', verdict: 'skipped', summary: 'archived' },
      ],
      converged: true,
    },
    checkedAt: '2026-09-16T22:00:01Z',
  },
  findings: [],
  refreshedAt: '2026-09-16T22:00:01Z',
  source: 'sweep',
  age: '5m6s',
};

/** Declared by nobody, archived on GitHub, a fork: the lifecycle filter counts it archived all the same. */
export const forgottenFork: InventoryRecord = {
  repository: 'giantswarm/forgotten-fork',
  name: 'forgotten-fork',
  declaration: null,
  reality: {
    url: 'https://github.com/giantswarm/forgotten-fork',
    visibility: 'private',
    isArchived: true,
    isFork: true,
    isTemplate: false,
    isEmpty: false,
    createdAt: '2019-09-01T00:00:00Z',
    historySampled: 30,
    botCommits: 0,
    openPullRequests: { total: 0, people: 0, bots: 0, renovate: 0 },
    openIssues: 2,
    has: {},
  },
  renovate: { configured: false, enabled: false, preset: false },
  catalog: { present: false },
  mapping: { present: false },
  setup: { checkError: 'no declaration: the set-up checks need a team' },
  findings: [
    {
      kind: 'undeclared-on-github',
      message: 'on GitHub without a declaration',
      fix: 'declare it in a team file or archive it',
      source: 'inventory',
    },
  ],
  refreshedAt: '2026-09-16T21:00:00Z',
  source: 'sweep',
  age: '1h5m4s',
};

/**
 * Declared with a field the engine's schema does not know: the entry is
 * refused, no step ran, and the engine's result says converged all the same
 * -- the page reads it as refused. Not one of `records`, whose count and
 * order the tests pin: a test or the dev app adds it to the inventory.
 */
export const refusedPlan: InventoryRecord = {
  repository: 'giantswarm/refused-plan',
  name: 'refused-plan',
  declaration: {
    team: 'team-bumblebee',
    file: 'repositories/team-bumblebee.yaml',
    componentType: 'configuration',
    entry:
      '- name: refused-plan\n  componentType: configuration\n  agentMerge: true\n',
    accepted: false,
    problems: ['agentMerge: not a field of the repositories schema'],
  },
  reality: {
    url: 'https://github.com/giantswarm/refused-plan',
    description: 'Plans, reviewed before they are merged',
    visibility: 'private',
    defaultBranch: 'main',
    isArchived: false,
    isFork: false,
    isTemplate: false,
    isEmpty: false,
    createdAt: '2026-08-01T09:00:00Z',
    pushedAt: '2026-09-16T15:00:00Z',
    lastCommit: {
      date: '2026-09-16T15:00:00Z',
      author: 'alice',
      message: 'Plan the week',
    },
    lastPersonCommit: {
      date: '2026-09-16T15:00:00Z',
      author: 'alice',
      message: 'Plan the week',
    },
    historySampled: 30,
    botCommits: 0,
    openPullRequests: { total: 1, people: 1, bots: 0, renovate: 0 },
    openIssues: 0,
    codeownersTeams: ['team-bumblebee'],
    has: { readme: true, codeowners: true },
  },
  renovate: { configured: false, enabled: false, preset: false },
  catalog: { present: false },
  mapping: { present: true, team: 'bumblebee' },
  setup: {
    checks: {
      repository: 'giantswarm/refused-plan',
      declared: 'refused-plan',
      team: 'team-bumblebee',
      mode: 'check',
      added: false,
      startedAt: '2026-09-16T22:00:00Z',
      finishedAt: '2026-09-16T22:00:00Z',
      steps: [
        {
          step: 'entry',
          verdict: 'reported',
          summary: 'entry refused',
          findings: [
            {
              kind: 'entry-refused',
              message: 'agentMerge: not a field of the repositories schema',
              fix: 'fix the entry in repositories/team-bumblebee.yaml',
            },
          ],
        },
      ],
      converged: true,
    },
    checkedAt: '2026-09-16T22:00:00Z',
  },
  findings: [
    {
      kind: 'entry-refused',
      message: 'agentMerge: not a field of the repositories schema',
      fix: 'fix the entry in repositories/team-bumblebee.yaml',
      source: 'engine',
    },
  ],
  refreshedAt: '2026-09-16T22:00:00Z',
  source: 'sweep',
  age: '5m7s',
};

export const records: Record<string, InventoryRecord> = {
  'giantswarm/present-service': presentService,
  'giantswarm/new-service': newService,
  'giantswarm/stray-tool': strayTool,
  'giantswarm/legacy-tool': legacyTool,
  'giantswarm/old-operator': oldOperator,
  'giantswarm/forgotten-fork': forgottenFork,
};

/** Activity is judged against this moment: the fixtures' dates stand still. */
export const NOW = new Date('2026-09-17T00:00:00Z');

/** The manager's default period for judging Renovate active or inactive. */
const RENOVATE_ACTIVE_DAYS = 180;

const DAY_MS = 86_400_000;

/** Days from `iso` to `now`; infinite without a date. */
export const daysSince = (iso: string | undefined, now: Date) =>
  iso ? (now.getTime() - new Date(iso).getTime()) / DAY_MS : Infinity;

/**
 * A record's Renovate state as the manager derives it for a row: `missing`
 * without a configuration, `active` when Renovate committed or opened a pull
 * request within the activity period, else `inactive`.
 */
export function renovateStateOf(
  record: InventoryRecord,
  now: Date,
): RenovateState {
  const { configured, lastCommit, lastPullRequest } = record.renovate;
  if (!configured) {
    return 'missing';
  }
  const active = [lastCommit, lastPullRequest?.createdAt].some(
    seen => daysSince(seen, now) < RENOVATE_ACTIVE_DAYS,
  );
  return active ? 'active' : 'inactive';
}

/** The `list_repositories` row of a record, as the manager derives it when read at `now`. */
export function rowOf(record: InventoryRecord, now = NOW): RepositoryRow {
  return {
    repository: record.repository,
    team: record.declaration?.team,
    lifecycle: record.declaration?.lifecycle,
    visibility: record.reality?.visibility,
    archived: record.reality?.isArchived ?? false,
    gone: record.reality === null || undefined,
    fork: record.reality?.isFork,
    renovate: record.reality ? renovateStateOf(record, now) : undefined,
    lastPersonCommit: record.reality?.lastPersonCommit?.date,
    findings: record.findings.map(finding => finding.kind),
    ci: record.ci && {
      orb: record.ci.orb,
      arm64: record.ci.arm64,
      chinaPush: record.ci.chinaPush,
      signing: record.ci.signing,
    },
    setup: {
      converged: record.setup.checks?.converged,
      // The engine refused the entry: its result has the entry step, no other.
      refused: record.setup.checks?.steps.some(step => step.step === 'entry'),
      checkedAt: record.setup.checkedAt,
      lastRun: record.setup.lastRun?.runUrl,
      pendingRun: record.setup.pendingRun,
      error: record.setup.checkError,
    },
    age: record.age ?? '',
  };
}

/** The last sweep over the fixture records, as `list_repositories` reports it. */
export const sweep: SweepSummary = {
  startedAt: '2026-09-16T21:00:00Z',
  finishedAt: '2026-09-16T21:04:00Z',
  duration: '4m0s',
  repositories: 6,
  declared: 4,
  undeclared: 2,
  gone: 0,
  archived: 2,
  engineChecks: 4,
  removed: 0,
};

/** A listing of these rows out of an inventory of `total` (default: the rows). */
export function listingOf(
  rows: RepositoryRow[],
  total = rows.length,
): RepositoryListing {
  return {
    sweep,
    sweepRunning: false,
    total,
    matched: rows.length,
    shown: rows.length,
    repositories: rows,
  };
}

/**
 * The write tools' answers for the fixtures, in the shapes the manager
 * returns them: the dry run of a declaration (`validate_repository`), a
 * write's plan and its committed outcome, an alignment's dispatch.
 */

export const acceptedValidation: Validation = {
  team: 'team-bumblebee',
  mode: 'create',
  schema: 'embedded',
  entries: [
    {
      name: 'shiny-service',
      rendered:
        '- name: shiny-service\n  componentType: service\n  gen:\n    language: go\n    flavours:\n      - app\n    ci:\n      generate: true\n',
      template: 'giantswarm/template',
      nameCheck: { verdict: 'free' },
      accepted: true,
    },
  ],
  accepted: true,
  author: 'Alice',
  authorLogin: 'alice',
  authorTeams: ['team-bumblebee'],
  teamsSource: 'github',
  machineApproved: true,
  creation: {
    repositories: [
      {
        name: 'shiny-service',
        steps: [
          {
            step: 'create',
            verdict: 'drift',
            changes: ['create giantswarm/shiny-service (private)'],
          },
          {
            step: 'scaffold',
            verdict: 'drift',
            changes: [
              'render the scaffold and push it as the first commit on main',
            ],
          },
        ],
      },
    ],
    pullRequest: {
      repository: 'giantswarm/github',
      branch: 'reposetup/create-shiny-service',
      title: 'feat(repositories): declare shiny-service for team-bumblebee',
      files: ['repositories/team-bumblebee.yaml'],
      body: '## Problem\n\n…',
      as: 'alice',
    },
  },
};

/**
 * A configuration repository with the CircleCI generator on: the creation
 * rules refuse `gen.ci.generate` (nothing to build) and say what to set.
 */
export const ciRefusedValidation: Validation = {
  ...acceptedValidation,
  entries: [
    {
      name: 'shiny-config',
      rendered:
        '- name: shiny-config\n  componentType: configuration\n  gen:\n    language: generic\n    flavours:\n      - generic\n    ci:\n      generate: true\n',
      template: 'minimal',
      nameCheck: { verdict: 'free' },
      problems: [
        {
          field: 'gen.ci.generate',
          message:
            'no CircleCI job for language generic without the app flavour or gen.ci.image.dockerfile; set it to false',
        },
      ],
      accepted: false,
    },
  ],
  accepted: false,
  machineApproved: false,
  creation: undefined,
  findings: [
    {
      kind: 'gen-circleci-refused',
      message:
        'gen.ci.generate: no CircleCI job for language generic without the app flavour or gen.ci.image.dockerfile; set it to false',
      fix: 'edit gen.ci.generate of the entry "shiny-config" in repositories/team-bumblebee.yaml: no CircleCI job for language generic without the app flavour or gen.ci.image.dockerfile; set it to false',
    },
  ],
};

/** The same configuration repository with the generator off: accepted. */
export const configurationValidation: Validation = {
  ...acceptedValidation,
  entries: [
    {
      name: 'shiny-config',
      rendered:
        '- name: shiny-config\n  componentType: configuration\n  gen:\n    language: generic\n    flavours:\n      - generic\n    ci:\n      generate: false\n',
      template: 'minimal',
      nameCheck: { verdict: 'free' },
      accepted: true,
    },
  ],
  creation: undefined,
};

/** The same declaration by a person outside the team: the team-review notice stands. */
export const noticedValidation: Validation = {
  ...acceptedValidation,
  authorTeams: ['team-honeybadger'],
  notices: [
    {
      kind: 'team-review',
      message:
        "alice is not a member of team-bumblebee or team-planeteers: the team's review will be required before the pull request merges",
    },
  ],
  machineApproved: false,
};

/** A declaration the creation rules refuse: the name is taken, the flavour unknown. */
export const refusedValidation: Validation = {
  ...acceptedValidation,
  entries: [
    {
      name: 'present-service',
      rendered: '- name: present-service\n  componentType: service\n',
      nameCheck: {
        verdict: 'taken',
        detail: 'giantswarm/present-service exists on GitHub',
      },
      problems: [
        {
          field: 'name',
          message: 'giantswarm/present-service exists on GitHub already',
        },
        {
          field: 'gen.flavours[0]',
          message: 'value must be one of "app", "cli", "cluster-app", …',
        },
      ],
      accepted: false,
    },
  ],
  accepted: false,
  machineApproved: false,
  findings: [
    {
      kind: 'entry-refused',
      message: 'name: giantswarm/present-service exists on GitHub already',
      fix: 'pick another name',
    },
  ],
};

export const openedPullRequest: PullRequest = {
  number: 4242,
  url: 'https://github.com/giantswarm/github/pull/4242',
  branch: 'reposetup/create-shiny-service',
  title: 'feat(repositories): declare shiny-service for team-bumblebee',
  author: 'alice',
};

/**
 * `create_repository` in `mode: commit`: the repository and its scaffold as
 * the person, then the declaration pull request.
 */
export const createdRepository: Created = {
  repositories: [
    {
      name: 'shiny-service',
      repository: 'https://github.com/giantswarm/shiny-service',
      created: true,
      scaffoldCommit: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
      steps: [
        { step: 'create', verdict: 'repaired', summary: 'created (private)' },
        {
          step: 'scaffold',
          verdict: 'repaired',
          summary: 'pushed as the first commit on main',
        },
      ],
    },
  ],
  pullRequest: openedPullRequest,
  firstRelease: "v0.1.0 follows from the scaffold's auto-release",
};

/** The plan of a write on present-service, filled in per action by the tests. */
export function planOf(overrides: Partial<Plan> = {}): Plan {
  return {
    repository: 'giantswarm/present-service',
    team: 'team-bumblebee',
    before: '- name: present-service\n  componentType: service\n',
    entry:
      '- name: present-service\n  componentType: service\n  lifecycle: archived\n',
    accepted: true,
    pullRequest: {
      repository: 'giantswarm/github',
      branch: 'reposetup/present-service-archived',
      title: 'chore(repositories): archive present-service',
      files: ['repositories/team-bumblebee.yaml'],
      body: '## Problem\n\n…',
      as: 'alice',
    },
    ask: {
      team: 'team-bumblebee',
      channel: '#team-bumblebee',
      text: 'alice asks to archive giantswarm/present-service — Approve lands it',
      deliverable: true,
    },
    ...overrides,
  };
}

export function committedOf(overrides: Partial<Committed> = {}): Committed {
  return {
    pullRequest: {
      ...openedPullRequest,
      number: 4243,
      url: 'https://github.com/giantswarm/github/pull/4243',
      branch: 'reposetup/present-service-archived',
      title: 'chore(repositories): archive present-service',
    },
    ask: {
      team: 'team-bumblebee',
      channel: '#team-bumblebee',
      delivered: true,
      reviewId: 'rev-1',
    },
    ...overrides,
  };
}

/**
 * `align_repository`'s answer for present-service, opted in (`align: true`
 * in its entry): the dispatch, planned or done, with the manager's warning
 * and the changes the last check planned. `overrides` turn it into the other
 * cases: an undeclared repository (`mode: check`), no check yet, nothing to
 * change.
 */
export function alignmentOf(
  dispatched: boolean,
  overrides: Partial<Alignment> = {},
): Alignment {
  return {
    workflow: 'reconcile-repositories.yaml',
    inputs: { repository: 'present-service', team: 'team-bumblebee' },
    as: 'alice',
    dispatched,
    runsUrl:
      'https://github.com/giantswarm/github/actions/workflows/reconcile-repositories.yaml',
    then: "the completion message follows in team-bumblebee's channel",
    team: 'team-bumblebee',
    optedIn: true,
    mode: 'align',
    planned: [
      {
        step: 'protection',
        changes: [
          'main: require the ci/circleci: build status check',
          'main: enforce for administrators',
        ],
      },
      { step: 'circleci', changes: ['follow the project'] },
    ],
    checkedAt: '2026-09-17T21:00:00Z',
    warning:
      "Aligning changes the repository's settings, permissions, branch protection and CircleCI project on GitHub and CircleCI to its declared set-up and the company baseline.",
    ...overrides,
  };
}

/**
 * `watch_repository`'s answers for shiny-service, in the manager's shape:
 * when each phase was reached (4 min 10 s from the creation to a settled
 * green release), the answer with the phases through one of them done and
 * the next pending, the ready answer, a red first release.
 */

export const WATCH_AT: Record<WatchPhaseName, string> = {
  created: '2026-09-18T10:00:00Z',
  scaffolded: '2026-09-18T10:00:04Z',
  declared: '2026-09-18T10:00:13Z',
  merged: '2026-09-18T10:01:15Z',
  setUp: '2026-09-18T10:02:29Z',
  released: '2026-09-18T10:04:10Z',
};

export const firstRelease = {
  tag: 'v0.1.0',
  url: 'https://github.com/giantswarm/shiny-service/releases/tag/v0.1.0',
};

const secondsBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 1000);

/**
 * The answer with the phases through `through` done (none for `undefined`)
 * and the phase after it pending; `overrides` make it ready, failed, or
 * carry the manager's reason for the pending phase. A failure leaves no
 * phase pending, as the manager answers.
 */
export function watchOf(
  through: WatchPhaseName | undefined,
  overrides: Partial<Watch> = {},
): Watch {
  const count = through ? WATCH_PHASES.indexOf(through) + 1 : 0;
  const names = WATCH_PHASES.slice(0, count);
  return {
    repository: 'https://github.com/giantswarm/shiny-service',
    pullRequest: count >= 3 ? openedPullRequest.url : undefined,
    phases: names.map((name, index) => ({
      name,
      at: WATCH_AT[name],
      seconds:
        index === 0
          ? 0
          : secondsBetween(WATCH_AT[names[index - 1]], WATCH_AT[name]),
    })),
    changed: false,
    ready: false,
    pending: overrides.failure ? undefined : WATCH_PHASES[count],
    waited: 20,
    ...overrides,
  };
}

/** Every phase done: the first release built green, one finding for the person. */
export const watchReady: Watch = watchOf('released', {
  ready: true,
  release: firstRelease,
  findings: [
    {
      kind: 'default-icon',
      message: 'the repository uses the default icon',
      fix: 'upload an icon in the repository settings',
    },
  ],
});

/** The first release red: the manager names the job. */
export const watchRedRelease: Watch = watchOf('setUp', {
  failure: {
    phase: 'released',
    reason:
      'the CircleCI statuses on v0.1.0 are failure: ci/circleci: build (failure)',
  },
  release: firstRelease,
});

const OPT_IN_PULL_REQUEST = {
  branch: 'reposetup/align-present-service',
  title:
    'chore(repositories): opt present-service in to alignment (team-bumblebee)',
};

/**
 * `align_repository`'s answer for present-service declared but not opted in
 * (`mode: opt-in`): nothing is dispatched; the commit opens the pull request
 * that sets `align: true` in its entry, the team's review asked in its
 * channel, and the reconciler aligns the repository when that merges.
 * `committed` is the answer after the commit: the pull request opened and
 * the delivered ask.
 */
export function optInAlignmentOf(committed: boolean): Alignment {
  return alignmentOf(false, {
    optedIn: false,
    mode: 'opt-in',
    warning:
      "giantswarm/present-service has not opted in to alignment. Align now opts it in — `align: true` in its entry, in a pull request team-bumblebee reviews (the ask goes to team-bumblebee's channel; a member other than you approves) — and the reconciler applies the planned changes when it merges: protection, circleci. It runs as you.",
    then: 'when the pull request merges, the reconciler aligns giantswarm/present-service (its push run); the record shows setup.pendingRun until that run reports',
    optIn: {
      plan: planOf({
        entry:
          '- name: present-service\n  componentType: service\n  align: true\n',
        pullRequest: {
          repository: 'giantswarm/github',
          ...OPT_IN_PULL_REQUEST,
          files: ['repositories/team-bumblebee.yaml'],
          body: '## Problem\n\n…',
          as: 'alice',
        },
        ask: {
          team: 'team-bumblebee',
          channel: '#team-bumblebee',
          text: 'alice asks to align `giantswarm/present-service` (owned by team-bumblebee): the change opts it in to alignment (`align: true`) and the reconciler applies 3 planned changes once merged — protection, circleci. A member of team-bumblebee other than alice approves.',
          deliverable: true,
        },
      }),
      committed: committed
        ? committedOf({
            pullRequest: {
              ...openedPullRequest,
              number: 4244,
              url: 'https://github.com/giantswarm/github/pull/4244',
              ...OPT_IN_PULL_REQUEST,
            },
          })
        : undefined,
    },
  });
}
