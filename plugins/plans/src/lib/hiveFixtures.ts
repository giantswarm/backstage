/**
 * The magazine and knowledge fixtures `PlansFixtureApi` serves
 * (`plans.fixtures: true`): local development and design reviews without
 * the magazine repository. The shapes are the magazine's data contract
 * (`lib/magazine.ts`), so Hive cannot tell.
 *
 * Epic and issue titles are public `giantswarm/roadmap` issues; the people
 * and the customers ("Customer A" …) are made up, and every figure and
 * timestamp is invented relative to now.
 */

import {
  Entry,
  Group,
  History,
  Lane,
  MagazineCard,
  MagazineClass,
  Now,
  PlanCard,
} from './magazine';

const BUMBLEBEE = 'Bumblebee🐝';
const ROADMAP = 'https://github.com/giantswarm/roadmap/issues';

/** The fixture board's item detail (the roadmap plugin's fixture board). */
function boardPath(number: number): string {
  return `/hive/roadmap/items/fixture-${number}`;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

type CardSeed = {
  number: number;
  title: string;
  status: string;
  teaser: string;
  kind?: MagazineCard['kind'];
  customers?: string[];
  assignees?: string[];
  progress?: [number, number];
  updated: number;
  team?: string;
  tryIt?: string;
  blocker?: MagazineCard['blocker'];
};

function card(lane: MagazineClass, seed: CardSeed): MagazineCard {
  const team = seed.team ?? BUMBLEBEE;
  return {
    key: `giantswarm/roadmap#${seed.number}`,
    title: seed.title,
    url: `${ROADMAP}/${seed.number}`,
    kind: seed.kind ?? 'epic',
    status: seed.status,
    class: lane,
    teaser: seed.teaser,
    customers: seed.customers ?? [],
    team,
    progress: seed.progress
      ? { done: seed.progress[0], total: seed.progress[1] }
      : undefined,
    blocker: seed.blocker,
    tryIt: seed.tryIt ? { label: 'Try it', url: seed.tryIt } : undefined,
    assignees: seed.assignees ?? [],
    updatedAt: ago(seed.updated),
    links: [{ label: 'Board', url: boardPath(seed.number) }],
  };
}

const CUSTOMERS: CardSeed[] = [
  {
    number: 3297,
    title:
      'Backstage should allow inspecting k8s resources from workload clusters',
    status: 'In Progress ⛏️',
    teaser:
      'Pods, events and logs of a workload cluster from its page, without a kubeconfig.',
    customers: ['Customer A', 'Customer C'],
    assignees: ['Mira Okafor', 'Jonas Weber'],
    progress: [4, 7],
    updated: 5 * HOUR,
  },
  {
    number: 3970,
    title: "Provide a cluster's Kubernetes API endpoint via UIs",
    status: 'Validation ☑️',
    teaser:
      'The API endpoint and a copyable login command on every cluster page.',
    customers: ['Customer A'],
    assignees: ['Ada Park'],
    progress: [3, 3],
    updated: 20 * HOUR,
  },
  {
    number: 3519,
    title: 'Backstage UI for cluster creation',
    status: 'In Progress ⛏️',
    teaser:
      'Create a workload cluster from the portal through the same templates GitOps uses.',
    customers: ['Customer B'],
    assignees: ['Lukas Brandt'],
    progress: [2, 6],
    updated: 2 * DAY,
    blocker: {
      reason: 'Waits on the cluster-manager release with the create tool',
      since: ago(3 * DAY),
      owner: 'Lukas Brandt',
    },
  },
  {
    number: 3818,
    title: 'Make it easy to access support from the developer portal',
    status: 'Up Next ➡️',
    teaser:
      'One place to open a support request with the cluster and app already filled in.',
    customers: ['Customer D'],
    assignees: [],
    progress: [0, 4],
    updated: 4 * DAY,
  },
  {
    number: 3504,
    title: 'Provide app values schema documentation in Backstage',
    status: 'Up Next ➡️',
    teaser:
      "An app's values, documented from its schema, next to its versions.",
    customers: ['Customer B', 'Customer E'],
    assignees: ['Sofia Rossi'],
    progress: [1, 5],
    updated: 6 * DAY,
  },
  {
    number: 3503,
    title:
      'Backstage UI for jumping into cloud provider account view for a cluster',
    status: 'Backlog 📦',
    teaser: "A link from a cluster to its cloud account's console view.",
    customers: ['Customer C'],
    assignees: [],
    updated: 12 * DAY,
  },
];

const TOP_EPICS: CardSeed[] = [
  {
    number: 4360,
    title: 'marge sweep engine: the rescue agent and the per-team weekly run',
    status: 'In Progress ⛏️',
    teaser:
      'A failing bot PR gets a coding agent that fixes it, once a week per team.',
    assignees: ['Theo Nakamura', 'Ada Park'],
    progress: [3, 5],
    updated: 3 * HOUR,
    tryIt: '/bot-prs',
  },
  {
    number: 4004,
    title: 'GitOps/Flux visibility in Backstage',
    status: 'In Progress ⛏️',
    teaser:
      'Every Kustomization and HelmRelease of an installation, with what holds it up.',
    assignees: ['Jonas Weber'],
    progress: [6, 9],
    updated: 9 * HOUR,
    tryIt: '/flux',
  },
  {
    number: 4362,
    title: 'marge sweep engine: branch-writing remedies (phase B)',
    status: 'In Progress ⛏️',
    teaser:
      'Remedies that push a fix to the bot branch instead of only labelling it.',
    assignees: ['Theo Nakamura'],
    progress: [1, 4],
    updated: 26 * HOUR,
  },
  {
    number: 4039,
    title: 'Homepage greeting in Backstage',
    status: 'Validation ☑️',
    teaser: 'The home page greets you with what changed since your last visit.',
    assignees: ['Sofia Rossi'],
    progress: [2, 2],
    updated: 2 * DAY,
    tryIt: '/',
  },
  {
    number: 4361,
    title: 'marge sweep engine: onboard Shield, Planeteers and Honey Badger',
    status: 'Up Next ➡️',
    teaser: 'Three more teams get the daily sweep and its weekly summary.',
    assignees: ['Ada Park'],
    progress: [0, 3],
    updated: 3 * DAY,
  },
  {
    number: 4364,
    title:
      "marge sweep engine: draft a rule for the week's most frequent unhandled failure",
    status: 'Up Next ➡️',
    teaser:
      'The sweep proposes the rule that would have handled its most common miss.',
    assignees: [],
    progress: [0, 2],
    updated: 5 * DAY,
  },
  {
    number: 3815,
    title: 'Make documentation available via/in Backstage',
    status: 'Backlog 📦',
    teaser: 'The platform docs searchable next to the catalog.',
    assignees: [],
    updated: 15 * DAY,
  },
];

const SETUP: CardSeed[] = [
  {
    number: 3894,
    title:
      'Add Backstage related tasks to installation setup and teardown guide',
    status: 'In Progress ⛏️',
    teaser:
      'A new installation gets its portal without a hand-written checklist.',
    assignees: ['Lukas Brandt'],
    progress: [2, 3],
    updated: 30 * HOUR,
  },
  {
    number: 3825,
    title: 'Backstage test coverage improvement',
    status: 'In Progress ⛏️',
    teaser: 'Every page has a browser test in the local lab before it merges.',
    assignees: ['Mira Okafor'],
    progress: [5, 8],
    updated: 4 * DAY,
  },
  {
    number: 3456,
    title: 'Collect more advanced usage metrics in Backstage',
    status: 'Up Next ➡️',
    teaser: 'Which pages and actions people use, per installation.',
    assignees: [],
    progress: [1, 4],
    updated: 8 * DAY,
  },
];

const CHORES: CardSeed[] = [
  {
    number: 3780,
    title: 'Backstage session can expire while user is using a template',
    status: 'In Progress ⛏️',
    kind: 'bug',
    teaser: 'A long template run keeps its session alive.',
    assignees: ['Jonas Weber'],
    updated: 7 * HOUR,
  },
  {
    number: 3830,
    title: 'Installation name in deployments view should be linked',
    status: 'Validation ☑️',
    kind: 'task',
    teaser: 'The installation column links to the installation page.',
    assignees: ['Sofia Rossi'],
    updated: 28 * HOUR,
  },
  {
    number: 3837,
    title: "Handle clusters in 'Deleting' state",
    status: 'Up Next ➡️',
    kind: 'bug',
    teaser: 'A cluster being deleted says so instead of showing as broken.',
    assignees: [],
    updated: 3 * DAY,
  },
  {
    number: 3870,
    title: 'Allow navigation from deployment to GitOps source',
    status: 'Up Next ➡️',
    kind: 'task',
    teaser: 'From a deployment to the repository path that declares it.',
    assignees: [],
    updated: 6 * DAY,
  },
  {
    number: 3546,
    title: 'Backstage catalog details to be filled asynchronously',
    status: 'Backlog 📦',
    kind: 'task',
    teaser: 'The catalog page renders before every detail is in.',
    assignees: [],
    updated: 9 * DAY,
  },
  {
    number: 3973,
    title: 'Show deeper workload info in deployment details pane',
    status: 'Backlog 📦',
    kind: 'task',
    teaser: 'Replicas, restarts and the last event in the details pane.',
    assignees: [],
    updated: 11 * DAY,
  },
];

const UPCOMING: CardSeed[] = [
  {
    number: 4373,
    title:
      '[EPIC] Grafana on-behalf-of authentication for mcp-observability-platform',
    status: 'Up Next ➡️',
    teaser: 'The observability MCP acts as the person, not a shared admin.',
    team: 'Atlas 🗺️',
    updated: 2 * DAY,
  },
  {
    number: 4383,
    title:
      'cluster-aks: support Azure CNI Overlay, custom pod CIDR, UDR outbound and ACNS',
    status: 'In Progress ⛏️',
    teaser: 'More AKS network shapes for workload clusters.',
    team: 'Phoenix 🔥',
    updated: 20 * HOUR,
  },
  {
    number: 4380,
    title: 'gitops-template: move to HelmReleases and Envoy Gateway',
    status: 'Up Next ➡️',
    teaser:
      'The GitOps template follows the platform’s current building blocks.',
    team: 'Honey Badger 🦡',
    updated: 4 * DAY,
  },
  {
    number: 4179,
    title: 'Kubernetes `v1.35`',
    status: 'In Progress ⛏️',
    teaser: 'The next Kubernetes minor across the providers.',
    team: 'Planeteers 🪐',
    updated: 1 * DAY,
  },
  {
    number: 2486,
    title: "Manage customers' dex instances using dex-operator",
    status: 'Backlog 📦',
    teaser: 'Customer identity connectors reconciled like the platform’s own.',
    team: 'Shield 🛡️',
    updated: 9 * DAY,
  },
];

function makeLane(
  id: MagazineClass,
  title: string,
  summary: string,
  seeds: CardSeed[],
): Lane {
  const cards = seeds.map(seed => card(id, seed));
  return { id, title, summary, total: cards.length, cards };
}

function plans(): PlanCard[] {
  const seeds: Array<{
    title: string;
    state: PlanCard['state'];
    epic: number;
    epicTitle: string;
    updated: number;
    openQuestion?: string;
  }> = [
    {
      title: 'Hive: one place for Plans, Roadmap and the product overview',
      state: 'review',
      epic: 4039,
      epicTitle: 'Homepage greeting in Backstage',
      updated: 4 * HOUR,
    },
    {
      title: 'marge rescue agent: one agent per failing bot PR',
      state: 'review',
      epic: 4360,
      epicTitle:
        'marge sweep engine: the rescue agent and the per-team weekly run',
      updated: 22 * HOUR,
    },
    {
      title: 'Cluster creation from the portal: templates or cluster-manager',
      state: 'grilling',
      epic: 3519,
      epicTitle: 'Backstage UI for cluster creation',
      updated: 2 * DAY,
      openQuestion: 'Does the portal write to the GitOps repository itself?',
    },
    {
      title: 'Support requests with context',
      state: 'draft',
      epic: 3818,
      epicTitle: 'Make it easy to access support from the developer portal',
      updated: 3 * DAY,
    },
    {
      title: 'Branch-writing remedies and their guard rails',
      state: 'grilling',
      epic: 4362,
      epicTitle: 'marge sweep engine: branch-writing remedies (phase B)',
      updated: 5 * DAY,
      openQuestion: 'Which remedies may push without a person?',
    },
  ];
  return seeds.map((seed, i) => ({
    key: `plan-${i + 1}`,
    title: seed.title,
    url: `${ROADMAP}/${seed.epic}`,
    state: seed.state,
    epic: {
      key: `giantswarm/roadmap#${seed.epic}`,
      title: seed.epicTitle,
      url: `${ROADMAP}/${seed.epic}`,
    },
    updatedAt: ago(seed.updated),
    openQuestion: seed.openQuestion,
  }));
}

export function fixtureNow(): Now {
  const lanes = [
    makeLane(
      'customer',
      'Customers',
      'What customers asked for, most recent movement first.',
      CUSTOMERS,
    ),
    makeLane(
      'top-epic',
      'Top epics',
      'The epics the team leads with this quarter.',
      TOP_EPICS,
    ),
    makeLane(
      'setup',
      'Setup',
      'Making new installations and the lab cheaper to run.',
      SETUP,
    ),
    makeLane(
      'chore',
      'Chores',
      'Bugs and small fixes that keep the portal tidy.',
      CHORES,
    ),
  ];
  const cards = lanes.flatMap(l => l.cards);
  return {
    generatedAt: ago(12 * 60_000),
    summary: [
      'Workload-cluster inspection for Customer A and C is past half-way.',
      'The marge rescue agent fixes its first bot PRs; two plans wait for review.',
      'Cluster creation waits on the cluster-manager release.',
    ],
    lanes,
    reviews: plans(),
    blocked: cards.filter(c => c.blocker),
    upcoming: UPCOMING.map(seed => card('top-epic', seed)),
  };
}

// --- History ----------------------------------------------------------------

type EntrySeed = {
  key: string;
  title: string;
  url: string;
  kind: Entry['kind'];
  at: number;
  repo: string;
  author?: string;
  teaser?: string;
};

function entries(group: MagazineClass, seeds: EntrySeed[]): Entry[] {
  return seeds.map(seed => ({
    ...seed,
    at: ago(seed.at),
    class: group,
    customers: [],
    team: BUMBLEBEE,
    links: [],
  }));
}

const issue = (
  number: number,
  title: string,
  at: number,
  author?: string,
): EntrySeed => ({
  key: `giantswarm/roadmap#${number}`,
  title,
  url: `${ROADMAP}/${number}`,
  kind: 'issue',
  at,
  repo: 'giantswarm/roadmap',
  author,
});

const release = (version: string, at: number, teaser: string): EntrySeed => ({
  key: `giantswarm/backstage@${version}`,
  title: `backstage ${version}`,
  url: `https://github.com/giantswarm/backstage/releases/tag/${version}`,
  kind: 'release',
  at,
  repo: 'giantswarm/backstage',
  teaser,
});

function historyGroups(): Group[] {
  const marge: Group = {
    key: 'giantswarm/roadmap#4360',
    title: 'marge sweep engine',
    url: boardPath(4360),
    kind: 'epic',
    teaser:
      'Bot PRs are swept daily per team; the rescue agent now fixes the ones the rules cannot.',
    class: 'top-epic',
    customers: [],
    progress: { from: { done: 0, total: 5 }, to: { done: 3, total: 5 } },
    tryIt: { label: 'Try it', url: '/bot-prs' },
    entries: entries('top-epic', [
      issue(4371, 'Document the sweep for every team', 1 * DAY, 'Ada Park'),
      issue(
        4365,
        'The per-team sweep summary through klaus-gateway',
        2 * DAY,
        'Theo Nakamura',
      ),
      issue(
        4359,
        'The Bot PRs page in the developer portal',
        2.5 * DAY,
        'Sofia Rossi',
      ),
      issue(
        4370,
        "The daily run's log says why a PR was refused",
        6 * DAY,
        'Ada Park',
      ),
      issue(
        4369,
        'A per-team schedule and action set',
        7 * DAY,
        'Theo Nakamura',
      ),
      issue(
        4357,
        'The MCP mode behind muster, acting as the caller',
        8 * DAY,
        'Jonas Weber',
      ),
      issue(
        4355,
        'Runtime rule loading and the rule catalogue',
        10 * DAY,
        'Theo Nakamura',
      ),
      issue(4352, 'Register the sweep GitHub App', 12 * DAY, 'Ada Park'),
    ]),
  };
  const apps: Group = {
    key: 'giantswarm/roadmap#4132',
    title: 'App management in the portal',
    url: boardPath(4132),
    kind: 'epic',
    teaser:
      'Install, configure and upgrade an app from its page, with the AI Assistant at the configuration step.',
    class: 'customer',
    customers: ['Customer A', 'Customer B'],
    progress: { from: { done: 5, total: 7 }, to: { done: 7, total: 7 } },
    tryIt: { label: 'Try it', url: '/deployments' },
    entries: entries('customer', [
      issue(
        4264,
        'Add AI Assistant to configuration step in App Deployment',
        1.5 * DAY,
        'Mira Okafor',
      ),
      issue(
        4243,
        'Improved matching of HelmRelease with native workloads',
        1.6 * DAY,
        'Jonas Weber',
      ),
      release('v2.91.0', 2 * DAY, 'App deployment with the AI Assistant step.'),
    ]),
  };
  const flux: Group = {
    key: 'giantswarm/roadmap#4004',
    title: 'GitOps/Flux visibility in Backstage',
    url: boardPath(4004),
    kind: 'epic',
    teaser:
      'The Flux tree now shows why a Kustomization is not ready, per installation.',
    class: 'top-epic',
    customers: [],
    progress: { from: { done: 4, total: 9 }, to: { done: 6, total: 9 } },
    tryIt: { label: 'Try it', url: '/flux' },
    entries: entries('top-epic', [
      release(
        'v2.90.0',
        20 * HOUR,
        'The Flux tree shows the blocking condition.',
      ),
      release(
        'v2.89.0',
        2.2 * DAY,
        'Flux: one installation scope in the header.',
      ),
    ]),
  };
  const chat: Group = {
    key: 'giantswarm/roadmap#4119',
    title: 'LLM frontend in the portal',
    url: boardPath(4119),
    kind: 'epic',
    teaser:
      'The AI Assistant answers with correct portal links and searches the docs.',
    class: 'top-epic',
    customers: [],
    progress: { from: { done: 3, total: 6 }, to: { done: 6, total: 6 } },
    tryIt: { label: 'Try it', url: '/ai-chat' },
    entries: entries('top-epic', [
      issue(
        4225,
        'Ensure that chat agent produces correct links',
        19 * DAY,
        'Sofia Rossi',
      ),
      issue(
        4171,
        'Connect portal LLM chat with search-mcp',
        19 * DAY,
        'Mira Okafor',
      ),
      issue(
        4226,
        'Only show Troubleshoot/Inspect with AI where mcp-kubernetes runs',
        19 * DAY,
        'Lukas Brandt',
      ),
    ]),
  };
  // Generated titles carry unbroken paths, links and code: the card wraps
  // them inside its column instead of widening the page.
  const unbroken: Group = {
    key: 'giantswarm/roadmap#4402',
    title:
      'giantswarm/cluster-api-provider-aws/controllers/awsmachinepool_controller_reconcile_launch_template_versions',
    url: boardPath(4402),
    kind: 'area',
    teaser:
      'Pinned in https://github.com/giantswarm/cluster-api-provider-aws/blob/main/controllers/awsmachinepool_controller.go#L412-L468 via `kubectl get awsmachinepools.infrastructure.cluster.x-k8s.io --all-namespaces --output=jsonpath={.items[*].status.launchTemplateVersion}`.',
    class: 'setup',
    customers: [],
    entries: entries('setup', [
      issue(
        4403,
        'Reconcile_LaunchTemplateVersions_when_the_AWSMachinePool_spec_changes_without_a_rolling_update_of_the_instances',
        3 * DAY,
        'Lukas Brandt',
      ),
    ]),
  };
  return [marge, apps, flux, chat, unbroken];
}

/** Hive's history: the last three weeks (15 work days). */
export function fixtureHistory(): History {
  const groups = historyGroups();
  const stats = { merged: 118, closed: 41, released: 11, epicsMoved: 9 };
  return {
    window: 'weeks',
    from: ago(21 * DAY),
    to: ago(0),
    generatedAt: ago(12 * 60_000),
    summary: [
      'The marge sweep engine went from plan to a daily run for the team.',
      'App management and the portal’s AI Assistant shipped to every internal portal.',
      'Flux visibility moved from a list to a tree with blocking conditions.',
    ],
    stats,
    groups,
    highlights: {
      customers: [{ name: 'Customer A', keys: ['giantswarm/roadmap#4264'] }],
      outsideTeam: [{ team: 'Atlas 🗺️', keys: [] }],
    },
    chores: {
      count: stats.merged - groups.length * 3,
      repos: 14,
      sample: [],
    },
  };
}

// --- Knowledge --------------------------------------------------------------

const KNOWLEDGE: Record<string, string> = {
  'knowledge/product/hive.md': `# Hive

Hive is the team's one place for its work: what it does **now**, what moved in
the last days, weeks and months, the **roadmap** board, the **plans** under
review and what the team **knows**.

- **Now** ranks the work: customers first, then the top epics, setup and chores.
- **History** tells what moved, epic by epic, with a link to try what shipped.
- **Roadmap** is the board; every epic opens the same detail page.
- **Plans** are reviewed where they are written.
`,
  'knowledge/product/marge-sweep.md': `# Bot PRs

The marge sweep keeps dependency PRs moving: a daily run per team merges the
green ones, labels what needs a person and hands the rest to a rescue agent.
The **Bot PRs** page in the portal shows each team's queue.
`,
  'knowledge/architecture/magazine-data.md': `# The magazine data

A generator reads the roadmap board, merged pull requests and releases every
30 minutes in work hours and writes \`now.json\` and three history windows to a
data branch. Hive reads those files; nothing in the portal crawls GitHub on
page load.

| File | What it holds |
|---|---|
| \`now.json\` | lanes, plans to review, blockers, other teams' work |
| \`history-days.json\` | the last 3 work days |
| \`history-weeks.json\` | the last 3 weeks |
| \`history-months.json\` | the last 3 months |
`,
  'knowledge/architecture/portal-sections.md': `# Portal sections

A section is one sidebar entry with routed tabs in the page header, like
Agent Platform and Hive. Each tab is a sub-page; the header carries the
controls that scope every tab.
`,
  'knowledge/decisions/2026-10-06-0900-pdr-one-hive.md': `# PDR: One Hive instead of three pages

**Status:** proposed

Plans, Roadmap and the product overview become one section with five tabs,
so the team scope, the search and the epic detail are shared.
`,
  'knowledge/decisions/2026-09-14-1000-adr-sweep-per-team.md': `# ADR: The sweep runs per team

**Status:** accepted

Each team owns its sweep policy and schedule; one engine serves them all.
`,
};

export function fixtureKnowledgeTree(): { path: string; type: string }[] {
  return Object.keys(KNOWLEDGE).map(path => ({ path, type: 'blob' }));
}

export function fixtureKnowledgeDoc(path: string): string {
  const doc = KNOWLEDGE[path];
  if (doc === undefined) {
    throw new Error(`No knowledge document at ${path}`);
  }
  return doc;
}
