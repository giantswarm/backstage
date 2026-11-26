import type {
  CheckRun,
  CommitStatus,
  Review,
  SearchItem,
} from '../../lib/github';

/** The lists a fixture PR is in; a search answers the PRs of its list. */
export type FixtureList =
  'waiting' | 'direct' | 'mine' | 'reviewed' | `team:${string}`;

export type FixturePr = {
  repo: string;
  number: number;
  title: string;
  author: string;
  draft?: boolean;
  labels?: string[];
  /** Days since it was opened. */
  age: number;
  /** Hours since its last update. */
  updated: number;
  lists: FixtureList[];
  ci: 'passing' | 'failing' | 'running' | 'none' | 'circleci-failing';
  review: 'none' | 'approved' | 'approved-twice' | 'changes';
  /** GitHub's `mergeable_state`; `unknown` stays "checking". */
  merge: string;
};

const ORG = 'giantswarm';

/**
 * The base data set: every icon value, a bot GitHub App the search cannot
 * leave out, the Giant Swarm bot it does, a draft, a PR in two sections,
 * and a request that names you next to ones through a team.
 */
export const BASE_PRS: FixturePr[] = [
  {
    repo: 'cluster-aws',
    number: 1412,
    title: 'Allow a custom AMI per machine pool',
    author: 'alder-quill',
    labels: ['enhancement'],
    age: 21,
    updated: 30,
    lists: ['waiting', 'direct'],
    ci: 'passing',
    review: 'none',
    merge: 'blocked',
  },
  {
    repo: 'observability-operator',
    number: 388,
    title: 'Drop the deprecated alertmanager route',
    author: 'birch-wren',
    age: 9,
    updated: 4,
    lists: ['waiting', 'team:team-bumblebee'],
    ci: 'failing',
    review: 'changes',
    merge: 'blocked',
  },
  {
    repo: 'kyverno-policies',
    number: 512,
    title: 'Exclude scan jobs from the proxy policy',
    author: 'cedar-lark',
    age: 6,
    updated: 2,
    lists: ['waiting', 'direct', 'reviewed'],
    ci: 'running',
    review: 'approved',
    merge: 'blocked',
  },
  {
    repo: 'happa-legacy-docs',
    number: 77,
    title: 'Move the runbook links to the handbook',
    author: 'dogwood-finch',
    age: 40,
    updated: 200,
    lists: ['waiting'],
    ci: 'passing',
    review: 'approved',
    merge: 'dirty',
  },
  {
    repo: 'security-bundle',
    number: 852,
    title: 'chore(deps): update security-bundle apps',
    author: 'heraldbot[bot]',
    labels: ['automated-update'],
    age: 3,
    updated: 6,
    lists: ['waiting', 'team:team-shield'],
    ci: 'passing',
    review: 'none',
    merge: 'clean',
  },
  {
    repo: 'cert-manager-app',
    number: 657,
    title: 'chore(chart): update cert-manager to v1.21.3 from upstream',
    author: 'taylorbot',
    labels: ['automated-update'],
    age: 12,
    updated: 48,
    lists: ['waiting', 'team:team-shield'],
    ci: 'circleci-failing',
    review: 'none',
    merge: 'unstable',
  },
  {
    repo: 'backstage',
    number: 3661,
    title: 'feat(plans): show the review state on Hive cards',
    author: 'elm-sparrow',
    draft: true,
    age: 1,
    updated: 1,
    lists: ['waiting', 'team:team-bumblebee'],
    ci: 'none',
    review: 'none',
    merge: 'draft',
  },
  {
    repo: 'teleport-kube-agent',
    number: 301,
    title: 'Pin the agent to the cluster version',
    author: 'guest',
    labels: ['bug'],
    age: 15,
    updated: 72,
    lists: ['mine'],
    ci: 'passing',
    review: 'changes',
    merge: 'behind',
  },
  {
    repo: 'dex-app',
    number: 640,
    title: 'Map connectors by id instead of by position',
    author: 'guest',
    age: 4,
    updated: 5,
    lists: ['mine'],
    ci: 'circleci-failing',
    review: 'none',
    merge: 'blocked',
  },
  {
    repo: 'flux-app',
    number: 399,
    title: 'Raise the kustomize-controller memory limit',
    author: 'guest',
    draft: true,
    age: 2,
    updated: 20,
    lists: ['mine'],
    ci: 'running',
    review: 'none',
    merge: 'unknown',
  },
  {
    repo: 'mimir-app',
    number: 455,
    title: 'Shard the ruler by tenant',
    author: 'fir-heron',
    age: 18,
    updated: 26,
    lists: ['reviewed', 'team:team-atlas'],
    ci: 'passing',
    review: 'approved-twice',
    merge: 'clean',
  },
  {
    repo: 'cluster-azure',
    number: 233,
    title: 'Support zonal private endpoints',
    author: 'gorse-kite',
    age: 30,
    updated: 100,
    lists: ['team:team-phoenix'],
    ci: 'failing',
    review: 'none',
    merge: 'dirty',
  },
];

const HOUR_MS = 60 * 60 * 1000;

function isoAgo(ms: number, now: number): string {
  return new Date(now - ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function searchItemOf(pr: FixturePr, now = Date.now()): SearchItem {
  return {
    number: pr.number,
    title: pr.title,
    draft: Boolean(pr.draft),
    html_url: `https://github.com/${ORG}/${pr.repo}/pull/${pr.number}`,
    user: { login: pr.author },
    labels: pr.labels ?? [],
    created_at: isoAgo(pr.age * 24 * HOUR_MS, now),
    updated_at: isoAgo(pr.updated * HOUR_MS, now),
    repository_url: `https://api.github.com/repos/${ORG}/${pr.repo}`,
  };
}

/** Check runs and CircleCI statuses for each CI value. */
export function ciOf(pr: FixturePr): {
  checkRuns: CheckRun[];
  statuses: CommitStatus[];
} {
  const run = (
    id: number,
    name: string,
    status: string,
    conclusion?: string,
  ) => ({
    id,
    name,
    status,
    conclusion: conclusion ?? null,
  });
  switch (pr.ci) {
    case 'none':
      return { checkRuns: [], statuses: [] };
    case 'failing':
      return {
        checkRuns: [
          run(1, 'pre-commit', 'completed', 'success'),
          // A re-run that passed does not count against the PR...
          run(2, 'check / validate', 'completed', 'failure'),
          run(5, 'check / validate', 'completed', 'success'),
          run(3, 'e2e / capa', 'completed', 'failure'),
        ],
        statuses: [],
      };
    case 'running':
      return {
        checkRuns: [
          run(1, 'pre-commit', 'completed', 'success'),
          run(2, 'e2e / capa', 'in_progress'),
        ],
        statuses: [{ context: 'ci/circleci: build', state: 'pending' }],
      };
    case 'circleci-failing':
      return {
        checkRuns: [run(1, 'publish / gitleaks', 'completed', 'success')],
        statuses: [
          { context: 'ci/circleci: go-build', state: 'failure' },
          { context: 'ci/circleci: push-to-registries', state: 'success' },
        ],
      };
    default:
      return {
        checkRuns: [
          run(1, 'pre-commit', 'completed', 'success'),
          run(2, 'validate-changelog', 'completed', 'skipped'),
        ],
        statuses: [{ context: 'ci/circleci: build', state: 'success' }],
      };
  }
}

export function reviewsOf(pr: FixturePr, now = Date.now()): Review[] {
  const review = (id: number, login: string, state: string, hours: number) => ({
    id,
    state,
    user: { login },
    submitted_at: isoAgo(hours * HOUR_MS, now),
  });
  switch (pr.review) {
    case 'approved':
      return [review(1, 'hazel-tern', 'APPROVED', 3)];
    case 'approved-twice':
      return [
        review(1, 'hazel-tern', 'COMMENTED', 30),
        review(2, 'hazel-tern', 'APPROVED', 20),
        review(3, 'ivy-plover', 'APPROVED', 10),
      ];
    case 'changes':
      return [
        review(1, 'hazel-tern', 'APPROVED', 40),
        review(2, 'juniper-rook', 'CHANGES_REQUESTED', 8),
      ];
    default:
      return [review(1, 'hazel-tern', 'COMMENTED', 5)];
  }
}

/** `many`: one list past GitHub's page, the others full. */
export function manyPrs(): FixturePr[] {
  const prs: FixturePr[] = [];
  const lists: { list: FixtureList; count: number }[] = [
    { list: 'waiting', count: 143 },
    { list: 'mine', count: 40 },
    { list: 'reviewed', count: 60 },
    { list: 'team:team-bumblebee', count: 120 },
  ];
  const ciValues: FixturePr['ci'][] = ['passing', 'failing', 'running', 'none'];
  const merges = ['clean', 'dirty', 'blocked', 'behind', 'unstable'];
  let number = 1000;
  for (const { list, count } of lists) {
    for (let i = 0; i < count; i++) {
      number++;
      prs.push({
        repo: `repo-${(i % 37) + 1}`,
        number,
        title: `Change ${number} for ${list}`,
        author: list === 'mine' ? 'guest' : `person-${i % 23}`,
        age: (i % 60) + 1,
        updated: (i % 48) + 1,
        lists: [
          list,
          ...(list === 'waiting' && i % 5 === 0 ? ['direct' as const] : []),
        ],
        ci: ciValues[i % ciValues.length],
        review: i % 3 === 0 ? 'approved' : 'none',
        merge: merges[i % merges.length],
      });
    }
  }
  return prs;
}

/** `long-names`: GitHub's longest title (256), login (39) and repository name (100). */
export function longNamePrs(): FixturePr[] {
  const words = (n: number) =>
    'Rework the reconciliation of every machine pool so that a long title wraps in whole words '
      .repeat(4)
      .slice(0, n)
      .trim();
  return BASE_PRS.map((pr, index) => ({
    ...pr,
    title: words(256),
    author:
      pr.author === 'guest'
        ? 'guest'
        : `${'a'.repeat(36)}-${index % 10}${index}`.slice(0, 39),
    repo: `${'very-long-repository-name-'.repeat(4)}${index}`.slice(0, 100),
    labels: [...(pr.labels ?? []), 'needs/long-label-for-the-layout-check'],
  }));
}
