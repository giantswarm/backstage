import {
  fixtureHistory,
  fixtureKnowledgeDoc,
  fixtureKnowledgeTree,
  fixtureNow,
} from '../lib/hiveFixtures';
import { HistoryWindow } from '../lib/magazine';
import {
  MagazineConfigResponse,
  NewReviewComment,
  PlanComment,
  PlanReviewComment,
  PlansApi,
  PlansCommentsResponse,
  PlansConnectionResponse,
  PlansContentResponse,
  PlansEpicsResponse,
  PlansPullFilesResponse,
  PlansPullsResponse,
  PlansReposResponse,
  PlansReviewCommentsResponse,
  PlansTreeResponse,
} from './types';

/**
 * An in-memory plans repository and magazine for local development and
 * design reviews (`plans.fixtures: true`): Hive, the plan list and a plan's
 * review render without muster and GitHub, through the same calls the
 * backend serves. The magazine files are generated from `lib/hiveFixtures`;
 * the plans are made up. New comments last until the page reloads.
 */

const PLANS_REPO = 'example/team-plans';
const MAGAZINE_REPO = 'example/team-magazine';
const DAY = 86_400_000;

const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const PULLS = [
  {
    number: 40,
    title: 'Workload cluster resources in the portal',
    author: 'mokafor',
    draft: false,
    branch: 'plan/workload-resources',
    updatedAt: ago(0.12),
    body: 'How the portal reads pods, events and logs of a workload cluster as the signed-in person, and what it never shows.',
    epic: 3297,
  },
  {
    number: 41,
    title: 'Hive: one place for Plans, Roadmap and the product overview',
    author: 'apark',
    draft: false,
    branch: 'plan/hive',
    updatedAt: ago(0.2),
    body: 'The plan for merging the three product pages into one section.',
    epic: 4039,
  },
  {
    number: 39,
    title: 'marge rescue agent: one agent per failing bot PR',
    author: 'tnakamura',
    draft: false,
    branch: 'plan/marge-rescue',
    updatedAt: ago(0.9),
    body: 'How the rescue agent picks up the bot PRs the rules cannot.',
    epic: 4360,
  },
  {
    number: 38,
    title: 'Support requests with context',
    author: 'srossi',
    draft: true,
    branch: 'plan/support-requests',
    updatedAt: ago(3),
    body: 'Opening a support request from a cluster or an app page.',
    epic: 3818,
  },
  {
    number: 37,
    title: 'Cluster creation from the portal: templates or cluster-manager',
    author: 'lbrandt',
    draft: true,
    branch: 'plan/cluster-creation',
    updatedAt: ago(2),
    body: 'Two ways to create a cluster from the portal, and the questions that decide between them.',
    epic: 3519,
  },
  {
    number: 36,
    title: 'Branch-writing remedies and their guard rails',
    author: 'tnakamura',
    draft: true,
    branch: 'plan/branch-remedies',
    updatedAt: ago(5),
    body: 'Which remedies may push to a bot branch without a person.',
    epic: 4362,
  },
  {
    number: 42,
    title: 'One README per plan: the plan template',
    author: 'mokafor',
    draft: false,
    branch: 'plan/template',
    updatedAt: ago(0.4),
    body: 'A template every plan starts from, so a reviewer finds the problem, the decision and the acceptance criteria in the same place. It changes how plans are written, not an epic.',
    epic: undefined,
  },
];

const PLAN_DOCS: Record<string, string> = {
  'hive/README.md': `# Hive

**Epic:** [giantswarm/roadmap#4039](https://github.com/giantswarm/roadmap/issues/4039)

## Problem

Plans, the roadmap board and the product overview are three pages. A reader
switches tools to answer one question: where is this epic?

## Proposed solution

One section, **Hive**, with five tabs: Now, History, Roadmap, Plans and
Knowledge. The team scope and the search sit in the header and hold across
every tab.

## Acceptance criteria

- One sidebar entry instead of three.
- Every old link opens its place in Hive.
- A failing source shows its error in its own tab only.
`,
  'hive/PRD.md': `# Hive: requirements

| Tab | Answers |
|---|---|
| Now | What do we work on, what waits on someone? |
| History | What moved in 3 days, 3 weeks, 3 months? |
| Roadmap | The board, by status and by person |
| Plans | What is proposed, what was decided |
| Knowledge | What the team knows |
`,
  'marge-rescue/README.md': `# marge rescue agent

**Epic:** [giantswarm/roadmap#4360](https://github.com/giantswarm/roadmap/issues/4360)

A bot PR the sweep's rules cannot handle gets one coding agent, which
pushes a fix to the bot branch or explains in a comment why it cannot.
`,
  'workload-resources/README.md': `# Workload cluster resources in the portal

**Epic:** [giantswarm/roadmap#3297](https://github.com/giantswarm/roadmap/issues/3297)

## Problem

A customer who wants to see why a pod restarts needs a kubeconfig for the
workload cluster, even for a look.

## Proposed solution

The cluster page reads pods, events and logs **as the signed-in person**,
through the same access the portal already has. Nothing is cached, nothing
is written.

## Acceptance criteria

- Pods and events per namespace on the cluster page.
- Logs of one container, the last 500 lines.
- A person without access sees why, not an empty list.
`,
  'workload-resources/PRD.md': `# Requirements

| What | Who | Shown |
|---|---|---|
| Pods | anyone with cluster access | per namespace |
| Events | anyone with cluster access | last hour |
| Logs | anyone who may read pods/log | last 500 lines |
`,
  'cluster-creation/README.md': `# Cluster creation from the portal

**Epic:** [giantswarm/roadmap#3519](https://github.com/giantswarm/roadmap/issues/3519)

## Open questions

- Does the portal write to the GitOps repository itself?
- Or does it call the cluster-manager's create tool?
`,
  'branch-remedies/README.md': `# Branch-writing remedies

**Epic:** [giantswarm/roadmap#4362](https://github.com/giantswarm/roadmap/issues/4362)

Which remedies may push to a bot branch without a person, and how each one
is undone.
`,
  'plan-template/README.md': `# The plan template

Every plan starts from one README with four sections.

## Problem

What hurts today, for whom.

## Decision

What we do, and the alternatives we did not take.

## Acceptance criteria

- The README template lives in the plans repository.
- A new plan starts from it.
`,
  'cluster-endpoint/README.md': `# The API endpoint on every cluster page

**Epic:** [giantswarm/roadmap#3970](https://github.com/giantswarm/roadmap/issues/3970)

## Decision

Every cluster page shows the Kubernetes API endpoint and a login command to
copy, for workload and management clusters alike.

## Acceptance criteria

- The endpoint shows on the cluster overview.
- The login command copies with one click.
`,
  'support-requests/README.md': `# Support requests with context

**Epic:** [giantswarm/roadmap#3818](https://github.com/giantswarm/roadmap/issues/3818)

A support request opened from a cluster or an app page carries the
installation, the cluster and the app version.
`,
};

const PULL_FILES: Record<number, string[]> = {
  41: ['hive/README.md', 'hive/PRD.md'],
  39: ['marge-rescue/README.md'],
  38: ['support-requests/README.md'],
  37: ['cluster-creation/README.md'],
  40: ['workload-resources/README.md', 'workload-resources/PRD.md'],
  36: ['branch-remedies/README.md'],
  42: ['plan-template/README.md'],
};

const MERGED = [
  'hive/README.md',
  'marge-rescue/README.md',
  'cluster-endpoint/README.md',
];

function magazineFile(path: string): string | undefined {
  if (path === 'magazine/now.json') {
    return JSON.stringify(fixtureNow());
  }
  const history = path.match(/^magazine\/history-(days|weeks|months)\.json$/);
  if (history) {
    return JSON.stringify(fixtureHistory(history[1] as HistoryWindow));
  }
  return undefined;
}

function notFound(path: string): Error {
  const error = new Error(`Not found: ${path}`);
  error.name = 'NotFoundError';
  return error;
}

export class PlansFixtureApi implements PlansApi {
  private comments: PlanComment[] = [
    {
      id: 1,
      author: 'Mira Okafor',
      body: 'Should History link each epic to its board item?',
      createdAt: ago(0.5),
    },
  ];
  private reviewComments: PlanReviewComment[] = [];

  async getConnection(): Promise<PlansConnectionResponse> {
    return { connected: true };
  }

  async getMagazine(): Promise<MagazineConfigResponse> {
    return {
      configured: true,
      repository: MAGAZINE_REPO,
      ref: 'data',
      knowledgeRef: 'main',
    };
  }

  async listRepos(): Promise<PlansReposResponse> {
    return { repositories: [PLANS_REPO] };
  }

  async listPulls(): Promise<PlansPullsResponse> {
    return { pulls: PULLS.map(({ epic: _epic, ...pull }) => pull) };
  }

  async listPullFiles(pullNumber: number): Promise<PlansPullFilesResponse> {
    return {
      files: (PULL_FILES[pullNumber] ?? []).map(filename => ({
        filename,
        status: 'added',
        additions: PLAN_DOCS[filename].split('\n').length,
        deletions: 0,
      })),
    };
  }

  async getTree(_ref?: string, repo?: string): Promise<PlansTreeResponse> {
    const paths =
      repo === MAGAZINE_REPO ? fixtureKnowledgeTree().map(e => e.path) : MERGED;
    return {
      truncated: false,
      tree: paths.map(path => ({ path, type: 'blob' })),
    };
  }

  async listEpics(): Promise<PlansEpicsResponse> {
    const epic = (number: number) => ({
      owner: 'giantswarm',
      repo: 'roadmap',
      number,
      url: `https://github.com/giantswarm/roadmap/issues/${number}`,
    });
    return {
      merged: [
        { folder: 'hive', path: 'hive/README.md', epic: epic(4039) },
        {
          folder: 'marge-rescue',
          path: 'marge-rescue/README.md',
          epic: epic(4360),
        },
        {
          folder: 'cluster-endpoint',
          path: 'cluster-endpoint/README.md',
          epic: epic(3970),
        },
      ],
      pulls: PULLS.flatMap(pull =>
        pull.epic
          ? [{ number: pull.number, title: pull.title, epic: epic(pull.epic) }]
          : [],
      ),
    };
  }

  async getContent(
    path: string,
    ref = 'main',
    repo = PLANS_REPO,
  ): Promise<PlansContentResponse> {
    const content =
      repo === MAGAZINE_REPO
        ? (magazineFile(path) ?? fixtureKnowledgeDoc(path))
        : PLAN_DOCS[path];
    if (content === undefined) {
      throw notFound(path);
    }
    return { path, ref, content };
  }

  async listPullComments(): Promise<PlansCommentsResponse> {
    return { comments: this.comments };
  }

  async createPullComment(_pull: number, body: string): Promise<PlanComment> {
    const comment = {
      id: this.comments.length + 1,
      author: 'You',
      body,
      createdAt: new Date().toISOString(),
    };
    this.comments = [...this.comments, comment];
    return comment;
  }

  async listReviewComments(): Promise<PlansReviewCommentsResponse> {
    return { comments: this.reviewComments };
  }

  async createReviewComment(
    _pull: number,
    comment: NewReviewComment,
  ): Promise<PlanReviewComment> {
    const created = {
      id: 1000 + this.reviewComments.length,
      author: 'You',
      body: comment.body,
      path: comment.path,
      line: comment.line,
      side: 'RIGHT',
      inReplyTo: comment.inReplyTo,
      createdAt: new Date().toISOString(),
    };
    this.reviewComments = [...this.reviewComments, created];
    return created;
  }
}
