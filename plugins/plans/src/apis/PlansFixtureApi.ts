import {
  FIXTURE_INSTALLATION,
  type FixtureScenario,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  fixtureScenario,
  withFixtureScenario,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import { HIVE_TEAMS, teamName } from '../lib/hive';
import { hiveFixtureMagazine, HiveFixtureMagazine } from '../lib/hiveFixtures';
import {
  fixtureTitle,
  lengthenSlug,
  lengthenTitle,
  login,
  LONG_LOGIN,
  LONG_SEGMENT,
  word,
} from '../lib/scenarioFixtures';
import {
  HIVE_HISTORY_WINDOW,
  MAGAZINE_TEAMS_FILE,
  magazineFile,
} from '../lib/magazine';
import {
  MagazineConfigResponse,
  NewReviewComment,
  PlanComment,
  PlanReviewComment,
  PlanPull,
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
 * the plans are made up. New comments last until the page reloads. What it
 * serves follows the page's fixture scenario (docs/fixtures.md).
 */

// The fixture magazine's team's plans repository (`<team>-plans`), which
// Hive's default team, Bumblebee, reads.
const PLANS_OWNER = 'example';
const PLANS_REPO = `${PLANS_OWNER}/bumblebee-plans`;
const MAGAZINE_REPO = 'example/team-magazine';
const DAY = 86_400_000;

const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const BASE_PULLS: FixturePull[] = [
  {
    number: 41,
    title: 'Hive: one place for Plans, Roadmap and the product overview',
    author: 'apark',
    draft: false,
    branch: 'plan/hive',
    updatedAt: ago(0.2),
    body: 'The plan for merging the three product pages into one section.',
    epic: 4039,
    files: ['hive/README.md', 'hive/PRD.md'],
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
    files: ['marge-rescue/README.md'],
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
    files: ['support-requests/README.md'],
  },
];

const BASE_DOCS: Record<string, string> = {
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

const BASE_MERGED: Record<string, number> = {
  hive: 4039,
  'marge-rescue': 4360,
};

/** An open plan pull request, with its epic and its files. */
interface FixturePull extends PlanPull {
  epic: number;
  files: string[];
}

/** The plans repositories' content one fixture scenario serves. */
export interface PlansFixtureData {
  repositories: string[];
  pulls: FixturePull[];
  /** The plan documents by path, of the pulls and of the merged plans. */
  docs: Record<string, string>;
  /** The merged plans: folder → the epic its README names. */
  merged: Record<string, number>;
  comments: PlanComment[];
  reviewComments: PlanReviewComment[];
  magazine: HiveFixtureMagazine;
}

function baseData(scenario: FixtureScenario): PlansFixtureData {
  return {
    repositories: [PLANS_REPO],
    pulls: BASE_PULLS,
    docs: BASE_DOCS,
    merged: BASE_MERGED,
    comments: [
      {
        id: 1,
        author: 'Mira Okafor',
        body: 'Should History link each epic to its board item?',
        createdAt: ago(0.5),
      },
    ],
    reviewComments: [],
    magazine: hiveFixtureMagazine(scenario),
  };
}

/** A generated plan's README, with enough lines to comment on. */
function planDoc(title: string, epic: number): string {
  const lines = Array.from(
    { length: 30 },
    (_, i) => `- The ${word(i)} step, and what it needs from ${word(i + 3)}.`,
  );
  return `# ${title}

**Epic:** [giantswarm/roadmap#${epic}](https://github.com/giantswarm/roadmap/issues/${epic})

## Steps

${lines.join('\n')}
`;
}

/**
 * `many`: a plans repository for each of Hive's teams, hundreds of open and
 * merged plans, and hundreds of comments on each pull request.
 */
function manyData(): PlansFixtureData {
  const docs: Record<string, string> = {};
  const pulls: FixturePull[] = Array.from({ length: 300 }, (_, i) => {
    const folder = `${word(i)}-${word(i + 11)}-${i + 1}`;
    const title = fixtureTitle(i, 'plan');
    const epic = 7000 + i;
    const files = [`${folder}/README.md`];
    docs[files[0]] = planDoc(title, epic);
    if (i % 3 === 0) {
      files.push(`${folder}/PRD.md`);
      docs[files[1]] = `# ${title}: requirements\n\nWhat the plan must do.\n`;
    }
    return {
      number: 1000 + i,
      title,
      author: login(i),
      draft: i % 4 === 0,
      branch: `plan/${folder}`,
      updatedAt: ago((i + 1) / 24),
      body: `The plan for the ${word(i)} work.`,
      epic,
      files,
    };
  });
  const merged: Record<string, number> = {};
  for (let i = 0; i < 300; i++) {
    const folder = `${word(i + 5)}-${word(i + 17)}-merged-${i + 1}`;
    const epic = 6000 + i;
    docs[`${folder}/README.md`] = planDoc(fixtureTitle(i + 3, 'plan'), epic);
    merged[folder] = epic;
  }
  return {
    repositories: HIVE_TEAMS.map(
      team =>
        `${PLANS_OWNER}/${teamName(team).toLowerCase().replace(/\s+/g, '')}-plans`,
    ),
    pulls,
    docs,
    merged,
    comments: Array.from({ length: 200 }, (_, i) => ({
      id: i + 1,
      author: login(i),
      body: `What does the ${word(i)} step need from ${word(i + 4)}?`,
      createdAt: ago((200 - i) / 24),
    })),
    reviewComments: Array.from({ length: 120 }, (_, i) => ({
      id: 1000 + i,
      author: login(i + 2),
      body: `Is the ${word(i)} step in the right place?`,
      path: pulls[0].files[0],
      line: 1 + (i % 30),
      side: 'RIGHT',
      createdAt: ago((120 - i) / 24),
    })),
    magazine: hiveFixtureMagazine('many'),
  };
}

/**
 * `long-names`: the base plans with every title as long as GitHub allows
 * (in whole words), every login as long as GitHub allows, and every plan
 * folder and branch name as long as git allows.
 */
function longNamesData(): PlansFixtureData {
  const base = baseData('long-names');
  const folders = new Map(
    [
      ...Object.keys(base.merged),
      ...base.pulls.flatMap(pull => pull.files.map(f => f.split('/')[0])),
    ].map(folder => [folder, lengthenSlug(folder, LONG_SEGMENT)]),
  );
  const longPath = (path: string) => {
    const [folder, ...rest] = path.split('/');
    return [folders.get(folder) ?? folder, ...rest].join('/');
  };
  return {
    ...base,
    repositories: [
      `${lengthenSlug(PLANS_OWNER, LONG_LOGIN)}/${PLANS_REPO.split('/')[1]}`,
    ],
    pulls: base.pulls.map((pull, i) => ({
      ...pull,
      title: lengthenTitle(pull.title),
      author: login(i, LONG_LOGIN),
      branch: lengthenSlug(pull.branch ?? 'plan', LONG_SEGMENT),
      files: pull.files.map(longPath),
    })),
    docs: Object.fromEntries(
      Object.entries(base.docs).map(([path, doc]) => [
        longPath(path),
        doc.replace(
          /^# (.*)$/m,
          (_, title: string) => `# ${lengthenTitle(title)}`,
        ),
      ]),
    ),
    merged: Object.fromEntries(
      Object.entries(base.merged).map(([folder, epic]) => [
        folders.get(folder) ?? folder,
        epic,
      ]),
    ),
    comments: base.comments.map((comment, i) => ({
      ...comment,
      author: login(i + 3, LONG_LOGIN),
    })),
  };
}

/** What a fixture scenario serves; `loading` and `error` have the base data. */
export function plansFixtureData(scenario: FixtureScenario): PlansFixtureData {
  switch (scenario) {
    case 'empty':
      return {
        repositories: [PLANS_REPO],
        pulls: [],
        docs: {},
        merged: {},
        comments: [],
        reviewComments: [],
        magazine: hiveFixtureMagazine('empty'),
      };
    case 'many':
      return manyData();
    case 'long-names':
      return longNamesData();
    default:
      return baseData(scenario);
  }
}

function magazineContent(
  magazine: HiveFixtureMagazine,
  path: string,
): string | undefined {
  if (path === MAGAZINE_TEAMS_FILE) {
    return JSON.stringify(magazine.teamSets);
  }
  // The default team's set, under `magazine/` and in its own folder.
  for (const folder of [
    undefined,
    ...magazine.teamSets.teams.map(set => set.path),
  ]) {
    if (path === magazineFile('now', folder)) {
      return JSON.stringify(magazine.now);
    }
    if (path === magazineFile('meta', folder)) {
      return JSON.stringify(magazine.meta);
    }
    if (path === magazineFile(HIVE_HISTORY_WINDOW, folder)) {
      return JSON.stringify(magazine.history);
    }
  }
  return magazine.knowledge[path];
}

function notFound(path: string): Error {
  const error = new Error(`Not found: ${path}`);
  error.name = 'NotFoundError';
  return error;
}

export class PlansFixtureApi implements PlansApi {
  private readonly data: PlansFixtureData;
  private comments: PlanComment[];
  private reviewComments: PlanReviewComment[];

  constructor(scenario: FixtureScenario = fixtureScenario()) {
    this.data = plansFixtureData(scenario);
    this.comments = this.data.comments;
    this.reviewComments = this.data.reviewComments;
  }

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
    return { repositories: this.data.repositories };
  }

  async listPulls(): Promise<PlansPullsResponse> {
    return {
      pulls: this.data.pulls.map(
        ({ epic: _epic, files: _files, ...pull }) => pull,
      ),
    };
  }

  async listPullFiles(pullNumber: number): Promise<PlansPullFilesResponse> {
    const pull = this.data.pulls.find(p => p.number === pullNumber);
    return {
      files: (pull?.files ?? []).map(filename => ({
        filename,
        status: 'added',
        additions: this.data.docs[filename].split('\n').length,
        deletions: 0,
      })),
    };
  }

  async getTree(_ref?: string, repo?: string): Promise<PlansTreeResponse> {
    const paths =
      repo === MAGAZINE_REPO
        ? Object.keys(this.data.magazine.knowledge)
        : Object.keys(this.data.merged).map(folder => `${folder}/README.md`);
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
      merged: Object.entries(this.data.merged).map(([folder, number]) => ({
        folder,
        path: `${folder}/README.md`,
        epic: epic(number),
      })),
      pulls: this.data.pulls.map(pull => ({
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
        ? magazineContent(this.data.magazine, path)
        : this.data.docs[path];
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

/**
 * The error of a call that reaches GitHub in the `error` scenario: muster
 * could not be reached, the 503 plans-backend answers then, as the client
 * surfaces it.
 */
function scenarioError(): Error {
  const error = new Error(
    `${FIXTURE_INSTALLATION} did not answer: the error fixture scenario fails every call.`,
  );
  error.name = 'ServiceUnavailableError';
  return error;
}

/**
 * The fixture `PlansApi`, as the page's fixture scenario serves it. In
 * `error`, the plans repositories and the magazine's place answer, as
 * plans-backend reads them from its configuration; every call that reaches
 * GitHub through muster fails.
 */
export function plansFixtureApi(): PlansApi {
  return withFixtureScenario('PlansApi', new PlansFixtureApi(), method =>
    method === 'listRepos' || method === 'getMagazine'
      ? undefined
      : scenarioError(),
  );
}
