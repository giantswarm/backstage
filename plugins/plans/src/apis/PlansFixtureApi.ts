import {
  fixtureHistory,
  fixtureKnowledgeDoc,
  fixtureKnowledgeTree,
  fixtureMeta,
  fixtureNow,
} from '../lib/hiveFixtures';
import { HIVE_HISTORY_WINDOW, magazineFile } from '../lib/magazine';
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

// The fixture magazine's team's plans repository (`<team>-plans`).
const PLANS_REPO = 'example/bumblebee-plans';
const MAGAZINE_REPO = 'example/team-magazine';
const DAY = 86_400_000;

const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const PULLS = [
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
};

const MERGED = ['hive/README.md', 'marge-rescue/README.md'];

function magazineContent(path: string): string | undefined {
  if (path === magazineFile('now')) {
    return JSON.stringify(fixtureNow());
  }
  if (path === magazineFile('meta')) {
    return JSON.stringify(fixtureMeta());
  }
  if (path === magazineFile(HIVE_HISTORY_WINDOW)) {
    return JSON.stringify(fixtureHistory());
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
      ],
      pulls: PULLS.map(pull => ({
        number: pull.number,
        title: pull.title,
        epic: epic(pull.epic),
      })),
    };
  }

  async getContent(
    path: string,
    ref = 'main',
    repo = PLANS_REPO,
  ): Promise<PlansContentResponse> {
    const content =
      repo === MAGAZINE_REPO
        ? (magazineContent(path) ?? fixtureKnowledgeDoc(path))
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
