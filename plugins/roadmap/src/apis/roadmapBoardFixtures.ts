import type { FixtureScenario } from '@giantswarm/backstage-plugin-gs-common';
import {
  capitalize,
  createNamer,
  createRandom,
  fitName,
  hashOf,
  type FixtureRandom,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import type {
  RoadmapIssue,
  RoadmapItem,
  RoadmapItemDetail,
  RoadmapSchemaResponse,
} from './types';

/**
 * The fixture board of each fixture scenario (docs/fixtures.md, "Scenarios"):
 * `base` is the hand-made board below, `empty` the same board without items,
 * `many` hundreds of items per column, each with 100 sub-issues (GitHub's
 * limit), 100 comments and 30 labels, and `long-names` the base board with
 * every name as long as GitHub allows, but the teams', which Hive's header
 * names. `loading` and `error` serve `base`; the API's factory makes
 * their calls hang or fail.
 */
export type FixtureBoard = {
  schema: RoadmapSchemaResponse;
  items: RoadmapItem[];
  /** What the item's detail adds to the item. */
  detailOf(
    item: RoadmapItem,
  ): Pick<RoadmapItemDetail, 'body' | 'author' | 'comments' | 'labels'>;
  subIssuesOf(owner: string, repo: string, number: number): RoadmapIssue[];
};

const DAY = 86_400_000;

/** GitHub's limits: an issue title, a login, a repository name, a label. */
const TITLE_LENGTH = 256;
const LOGIN_LENGTH = 39;
const REPOSITORY_NAME_LENGTH = 100;
const LABEL_LENGTH = 50;
/** A board field option, which GitHub sets no documented limit for. */
const OPTION_LENGTH = 63;
/** GitHub's limit of sub-issues per issue. */
const SUB_ISSUES_PER_ISSUE = 100;

const OWNER = 'giantswarm';
const REPOSITORY = `${OWNER}/roadmap`;

const BUMBLEBEE = 'Bumblebee🐝';
const STATUSES = [
  'Inbox 📥',
  'Backlog 📦',
  'Up Next ➡️',
  'In Progress ⛏️',
  'Validation ☑️',
  'Done ✅',
];
const TEAMS = [
  BUMBLEBEE,
  'Atlas 🗺️',
  'Cabbage 🥬',
  'Honey Badger 🦡',
  'Phoenix 🔥',
  'Planeteers 🪐',
  'Shield 🛡️',
  'Up 🎈',
];
const KINDS = ['Epic 🎯', 'Story 📖', 'Bug 🐞', 'Task ✔️', 'Request 🙋'];
const QUARTERS = ['2026 Q3', '2026 Q4', '2027 Q1'];
const AVAILABILITY = ['Ready Soon (<4 weeks)', 'Next Quarter', 'Later'];

/** The board's fields and their options, in the order the schema lists them. */
type Options = {
  statuses: string[];
  teams: string[];
  kinds: string[];
  quarters: string[];
  availability: string[];
};

const BASE_OPTIONS: Options = {
  statuses: STATUSES,
  teams: TEAMS,
  kinds: KINDS,
  quarters: QUARTERS,
  availability: AVAILABILITY,
};

type Seed = [
  number: number,
  title: string,
  status: number,
  kind: number,
  assignees: string[],
  team?: number,
];

/**
 * Titles are public `giantswarm/roadmap` issues; people and figures are made
 * up.
 */
const SEEDS: Seed[] = [
  [
    3297,
    'Backstage should allow inspecting k8s resources from workload clusters',
    3,
    0,
    ['Mira Okafor', 'Jonas Weber'],
  ],
  [
    3970,
    "Provide a cluster's Kubernetes API endpoint via UIs",
    4,
    0,
    ['Ada Park'],
  ],
  [3519, 'Backstage UI for cluster creation', 3, 0, ['Lukas Brandt']],
  [3818, 'Make it easy to access support from the developer portal', 2, 4, []],
  [
    3504,
    'Provide app values schema documentation in Backstage',
    2,
    4,
    ['Sofia Rossi'],
  ],
  [
    3503,
    'Backstage UI for jumping into cloud provider account view for a cluster',
    1,
    4,
    [],
  ],
  [
    4360,
    'marge sweep engine: the rescue agent and the per-team weekly run',
    3,
    0,
    ['Theo Nakamura', 'Ada Park'],
  ],
  [4004, 'GitOps/Flux visibility in Backstage', 3, 0, ['Jonas Weber']],
  [
    4362,
    'marge sweep engine: branch-writing remedies (phase B)',
    3,
    1,
    ['Theo Nakamura'],
  ],
  [4039, 'Homepage greeting in Backstage', 4, 1, ['Sofia Rossi']],
  [
    4361,
    'marge sweep engine: onboard Shield, Planeteers and Honey Badger',
    2,
    1,
    ['Ada Park'],
  ],
  [
    4364,
    "marge sweep engine: draft a rule for the week's most frequent unhandled failure",
    2,
    1,
    [],
  ],
  [3815, 'Make documentation available via/in Backstage', 1, 0, []],
  [
    3894,
    'Add Backstage related tasks to installation setup and teardown guide',
    3,
    3,
    ['Lukas Brandt'],
  ],
  [3825, 'Backstage test coverage improvement', 3, 3, ['Mira Okafor']],
  [3456, 'Collect more advanced usage metrics in Backstage', 2, 3, []],
  [
    3780,
    'Backstage session can expire while user is using a template',
    3,
    2,
    ['Jonas Weber'],
  ],
  [
    3830,
    'Installation name in deployments view should be linked',
    4,
    3,
    ['Sofia Rossi'],
  ],
  [3837, "Handle clusters in 'Deleting' state", 2, 2, []],
  [3870, 'Allow navigation from deployment to GitOps source', 2, 3, []],
  [3546, 'Backstage catalog details to be filled asynchronously', 1, 3, []],
  [3973, 'Show deeper workload info in deployment details pane', 1, 3, []],
  [3903, 'New Backstage plugin: Crossplane', 0, 4, []],
  [4132, 'App management in the portal', 5, 0, ['Mira Okafor', 'Jonas Weber']],
  [4119, 'LLM frontend in the portal', 5, 0, ['Sofia Rossi']],
  [
    4373,
    '[EPIC] Grafana on-behalf-of authentication for mcp-observability-platform',
    2,
    0,
    ['Rui Santos'],
    1,
  ],
  [
    4383,
    'cluster-aks: support Azure CNI Overlay, custom pod CIDR, UDR outbound and ACNS',
    3,
    1,
    ['Nora Lind'],
    4,
  ],
  [
    4380,
    'gitops-template: move to HelmReleases and Envoy Gateway',
    2,
    3,
    ['Ivo Petrov'],
    3,
  ],
  [4179, 'Kubernetes `v1.35`', 3, 0, ['Hana Sato'], 5],
  [2486, "Manage customers' dex instances using dex-operator", 1, 0, [], 6],
];

function schemaOf(options: Options): RoadmapSchemaResponse {
  return {
    board: 'Roadmap (fixture)',
    defaultTeams: [options.teams[0]],
    fields: [
      { name: 'Status', type: 'singleSelect', options: options.statuses },
      { name: 'Team', type: 'singleSelect', options: options.teams },
      { name: 'Kind', type: 'singleSelect', options: options.kinds },
      { name: 'Quarter', type: 'iteration', iterations: options.quarters },
      {
        name: 'Availability',
        type: 'singleSelect',
        options: options.availability,
      },
    ],
  };
}

/** The base board's items, with the names `rename` gives them. */
function seedItems(
  options: Options,
  rename: {
    title?: (title: string) => string;
    person?: (person: string) => string;
    repository?: string;
  } = {},
): RoadmapItem[] {
  const repo = rename.repository ?? REPOSITORY;
  return SEEDS.map(([number, title, status, kind, assignees, team], i) => ({
    id: `fixture-${number}`,
    title: rename.title?.(title) ?? title,
    number,
    url: `https://github.com/${repo}/issues/${number}`,
    repo,
    private: false,
    state: status === 5 ? 'CLOSED' : 'OPEN',
    createdAt: new Date(Date.now() - (40 + i * 3) * DAY).toISOString(),
    updatedAt: new Date(Date.now() - (i % 9) * 0.7 * DAY).toISOString(),
    assignees: assignees.map(person => rename.person?.(person) ?? person),
    labels: [],
    fields: {
      Status: options.statuses[status],
      Team: options.teams[team ?? 0],
      Kind: options.kinds[kind],
      Quarter: options.quarters[i % 2],
      Availability: options.availability[status >= 3 ? 0 : 1],
    },
  }));
}

/** The base board's item detail: a description, no comments or labels. */
function baseDetailOf(item: RoadmapItem) {
  return {
    body: [
      '### Problem',
      '',
      `Fixture text for "${item.title}". The real description comes from the issue.`,
      '',
      '### Acceptance criteria',
      '',
      '- [x] The plan is reviewed',
      '- [ ] The change is proven in the lab',
      '- [ ] It is rolled out to every internal portal',
    ].join('\n'),
    author: item.assignees?.[0] ?? 'Ada Park',
    comments: [],
    labels: [],
  };
}

/** `count` sub-issues of an issue, the first `done` of them closed. */
function subIssues(
  owner: string,
  repo: string,
  number: number,
  count: number,
  titleOf: (index: number) => string,
  done = number % 3,
): RoadmapIssue[] {
  // Numbers above the board's, a hundred per issue: GitHub's limit of
  // sub-issues.
  return Array.from({ length: count }, (_, i) => {
    const subIssue = number * SUB_ISSUES_PER_ISSUE + i;
    return {
      id: subIssue,
      number: subIssue,
      title: titleOf(i),
      state: i < done ? 'closed' : 'open',
      htmlUrl: `https://github.com/${owner}/${repo}/issues/${subIssue}`,
      assignees: [],
      repo: `${owner}/${repo}`,
    };
  });
}

function baseBoard(): FixtureBoard {
  return {
    schema: schemaOf(BASE_OPTIONS),
    items: seedItems(BASE_OPTIONS),
    detailOf: baseDetailOf,
    subIssuesOf: (owner, repo, number) =>
      subIssues(
        owner,
        repo,
        number,
        3 + (number % 3),
        i => `Fixture sub-issue ${i + 1}`,
      ),
  };
}

function emptyBoard(): FixtureBoard {
  return { ...baseBoard(), items: [] };
}

/**
 * `text` cut to at most `length` characters, at a word's end; its first word
 * whole however long.
 */
function wholeWords(text: string, length: number): string {
  if (text.length <= length) {
    return text;
  }
  const cut = text.slice(0, length + 1);
  const end = cut.lastIndexOf(' ');
  return end > 0 ? cut.slice(0, end) : text.split(' ')[0];
}

/**
 * Writes made of the fixture words: sentences and names of whole words, and
 * names cut at a limit, each as long as asked and no longer.
 */
function writer(random: FixtureRandom) {
  const namer = createNamer(random);
  const words = (length: number) =>
    wholeWords(namer(length).displayName.toLowerCase(), length);
  return {
    /** A sentence of `least` to `most` characters, ending at a word's end. */
    sentence: (least: number, most = least) =>
      capitalize(words(random.int(least, most))),
    /** Whole words joined with `-`, at most `length` characters. */
    name: (length: number) => words(length).replace(/ /g, '-'),
    /** Words joined with `-` and cut at `length`, a limit's length. */
    longName: (length: number) =>
      fitName(
        namer(length).displayName.toLowerCase().replace(/ /g, '-'),
        length,
      ),
  };
}

/** `option` lengthened to `length` with words, its first word and emoji kept. */
function longOption(
  option: string,
  length: number,
  write: ReturnType<typeof writer>,
): string {
  const emoji = option.match(/\s*\p{Extended_Pictographic}\S*$/u)?.[0] ?? '';
  const head = option.slice(0, option.length - emoji.length);
  const tail = emoji ? ` ${emoji.trim()}` : '';
  const room = length - head.length - tail.length - 1;
  return room > 0
    ? `${head} ${write.sentence(room).toLowerCase()}${tail}`
    : option;
}

/**
 * Writes the same for the same item on every call: one random per board, item
 * and list, so an item's comments and sub-issues read differently.
 */
const writerOf = (
  seed: number,
  number: number,
  list: 'comments' | 'sub-issues',
) => writer(createRandom(hashOf(`${seed}/${number}/${list}`)));

/** `count` different names `next` makes. */
function distinct(count: number, next: () => string): string[] {
  const names = new Set<string>();
  while (names.size < count) {
    names.add(next());
  }
  return [...names];
}

const LONG_NAMES_SEED = 4379;

function longNamesBoard(): FixtureBoard {
  const write = writer(createRandom(LONG_NAMES_SEED));
  const lengthen = (option: string) => longOption(option, OPTION_LENGTH, write);
  const options: Options = {
    statuses: STATUSES.map(lengthen),
    // Hive's header picks the team from its own list of these names.
    teams: TEAMS,
    kinds: KINDS.map(lengthen),
    quarters: QUARTERS.map(lengthen),
    availability: AVAILABILITY.map(lengthen),
  };
  const repository = `${OWNER}/${write.longName(REPOSITORY_NAME_LENGTH)}`;
  const people = new Map<string, string>();
  const person = (name: string) => {
    if (!people.has(name)) {
      people.set(name, write.longName(LOGIN_LENGTH));
    }
    return people.get(name)!;
  };
  const title = () => write.sentence(TITLE_LENGTH);
  const labels = distinct(3, () => write.longName(LABEL_LENGTH));
  const items = seedItems(options, { title, person, repository });
  const commenter = person('Ada Park');
  return {
    schema: schemaOf(options),
    items,
    detailOf: item => ({
      ...baseDetailOf(item),
      author: item.assignees?.[0] ?? commenter,
      comments: [
        {
          author: commenter,
          createdAt: new Date(Date.now() - 2 * DAY).toISOString(),
          body: writerOf(
            LONG_NAMES_SEED,
            item.number ?? 0,
            'comments',
          ).sentence(TITLE_LENGTH * 2),
        },
      ],
      labels,
    }),
    subIssuesOf: (owner, repo, number) => {
      const own = writerOf(LONG_NAMES_SEED, number, 'sub-issues');
      return subIssues(owner, repo, number, 3 + (number % 3), () =>
        own.sentence(TITLE_LENGTH),
      );
    },
  };
}

const MANY_SEED = 4380;
/** The items per status column of `many`'s first team, and beside them. */
const MANY_PER_COLUMN = 100;
const MANY_WITHOUT_STATUS = 40;
const MANY_OF_OTHER_TEAMS = 200;
const MANY_PEOPLE = 60;
const MANY_COMMENTS = 100;
const MANY_LABELS = 30;

function manyBoard(): FixtureBoard {
  const random = createRandom(MANY_SEED);
  const write = writer(random);
  const options: Options = {
    ...BASE_OPTIONS,
    quarters: ['2025', '2026', '2027'].flatMap(year =>
      [1, 2, 3, 4].map(quarter => `${year} Q${quarter}`),
    ),
  };
  const people = distinct(MANY_PEOPLE, () => write.name(random.int(8, 20)));
  const labels = distinct(MANY_LABELS, () => write.name(random.int(6, 20)));
  const itemOf = (
    index: number,
    team: string,
    status: string | undefined,
  ): RoadmapItem => {
    const number = 5000 + index;
    const assignees = [
      ...new Set(
        Array.from({ length: random.int(0, 4) }, () => random.pick(people)),
      ),
    ];
    return {
      id: `fixture-${number}`,
      title: write.sentence(20, 90),
      number,
      url: `https://github.com/${REPOSITORY}/issues/${number}`,
      repo: REPOSITORY,
      private: false,
      state: status === STATUSES[5] ? 'CLOSED' : 'OPEN',
      createdAt: new Date(Date.now() - (40 + index) * DAY).toISOString(),
      // A third moved in the last week, the rest in the month before.
      updatedAt: new Date(
        Date.now() - (index % 3 === 0 ? index % 7 : 8 + (index % 30)) * DAY,
      ).toISOString(),
      assignees,
      labels: [],
      fields: {
        ...(status && { Status: status }),
        Team: team,
        Kind: random.pick(options.kinds),
        Quarter: random.pick(options.quarters),
        Availability: random.pick(options.availability),
      },
    };
  };
  const ownTeam = [
    ...options.statuses.flatMap(status =>
      Array.from({ length: MANY_PER_COLUMN }, () => status),
    ),
    ...Array.from({ length: MANY_WITHOUT_STATUS }, () => undefined),
  ];
  const items = [
    ...ownTeam.map((status, i) => itemOf(i, BUMBLEBEE, status)),
    ...Array.from({ length: MANY_OF_OTHER_TEAMS }, (_, i) =>
      itemOf(
        ownTeam.length + i,
        options.teams[1 + (i % (options.teams.length - 1))],
        options.statuses[i % options.statuses.length],
      ),
    ),
  ];
  return {
    schema: schemaOf(options),
    items,
    detailOf: item => {
      const own = writerOf(MANY_SEED, item.number ?? 0, 'comments');
      return {
        ...baseDetailOf(item),
        comments: Array.from({ length: MANY_COMMENTS }, (_, i) => ({
          author: people[i % people.length],
          createdAt: new Date(
            Date.now() - (MANY_COMMENTS - i) * DAY,
          ).toISOString(),
          body: own.sentence(20, 200),
        })),
        labels,
      };
    },
    subIssuesOf: (owner, repo, number) => {
      const own = writerOf(MANY_SEED, number, 'sub-issues');
      return subIssues(
        owner,
        repo,
        number,
        SUB_ISSUES_PER_ISSUE,
        () => own.sentence(20, 90),
        30,
      );
    },
  };
}

/** The board of `scenario`. */
export function fixtureBoard(scenario: FixtureScenario): FixtureBoard {
  switch (scenario) {
    case 'empty':
      return emptyBoard();
    case 'many':
      return manyBoard();
    case 'long-names':
      return longNamesBoard();
    default:
      return baseBoard();
  }
}
