import {
  RoadmapApi,
  RoadmapConnectionResponse,
  RoadmapItem,
  RoadmapItemDetailResponse,
  RoadmapItemFilters,
  RoadmapItemsResponse,
  RoadmapOverviewResponse,
  RoadmapSchemaResponse,
  RoadmapSubIssuesResponse,
} from './types';

/**
 * An in-memory board for local development and design reviews
 * (`roadmap.fixtures: true`), so the board, the team activity and the item
 * detail render without muster and the GitHub board. Titles are public
 * `giantswarm/roadmap` issues; people and figures are made up. A status move
 * changes the board until the page reloads.
 */

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

type Seed = [
  number: number,
  title: string,
  status: number,
  kind: number,
  assignees: string[],
  team?: string,
];

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
    'Atlas 🗺️',
  ],
  [
    4383,
    'cluster-aks: support Azure CNI Overlay, custom pod CIDR, UDR outbound and ACNS',
    3,
    1,
    ['Nora Lind'],
    'Phoenix 🔥',
  ],
  [
    4380,
    'gitops-template: move to HelmReleases and Envoy Gateway',
    2,
    3,
    ['Ivo Petrov'],
    'Honey Badger 🦡',
  ],
  [4179, 'Kubernetes `v1.35`', 3, 0, ['Hana Sato'], 'Planeteers 🪐'],
  [
    2486,
    "Manage customers' dex instances using dex-operator",
    1,
    0,
    [],
    'Shield 🛡️',
  ],
];

const DAY = 86_400_000;

function makeItems(): RoadmapItem[] {
  return SEEDS.map(([number, title, status, kind, assignees, team], i) => ({
    id: `fixture-${number}`,
    title,
    number,
    url: `https://github.com/giantswarm/roadmap/issues/${number}`,
    repo: 'giantswarm/roadmap',
    private: false,
    state: status === 5 ? 'CLOSED' : 'OPEN',
    createdAt: new Date(Date.now() - (40 + i * 3) * DAY).toISOString(),
    updatedAt: new Date(Date.now() - (i % 9) * 0.7 * DAY).toISOString(),
    assignees,
    labels: [],
    fields: {
      Status: STATUSES[status],
      Team: team ?? BUMBLEBEE,
      Kind: KINDS[kind],
      Quarter: QUARTERS[i % 2],
      Availability: AVAILABILITY[status >= 3 ? 0 : 1],
    },
  }));
}

const FIELD_NAMES = {
  team: 'Team',
  status: 'Status',
  kind: 'Kind',
  availability: 'Availability',
};

function matches(item: RoadmapItem, filters: RoadmapItemFilters): boolean {
  const field = (name: string, value?: string) =>
    !value || item.fields[name] === value;
  const keyword = filters.keyword?.toLowerCase();
  return (
    (!filters.empty || !item.fields[FIELD_NAMES[filters.empty]]) &&
    field('Team', filters.team) &&
    field('Status', filters.status) &&
    field('Kind', filters.kind) &&
    field('Quarter', filters.quarter) &&
    field('Availability', filters.availability) &&
    (!keyword || item.title.toLowerCase().includes(keyword))
  );
}

export class RoadmapFixtureApi implements RoadmapApi {
  private items = makeItems();

  async getConnection(): Promise<RoadmapConnectionResponse> {
    return { connected: true };
  }

  async getSchema(): Promise<RoadmapSchemaResponse> {
    return {
      board: 'Roadmap (fixture)',
      defaultTeams: [BUMBLEBEE],
      fields: [
        { name: 'Status', type: 'singleSelect', options: STATUSES },
        { name: 'Team', type: 'singleSelect', options: TEAMS },
        { name: 'Kind', type: 'singleSelect', options: KINDS },
        { name: 'Quarter', type: 'iteration', iterations: QUARTERS },
        { name: 'Availability', type: 'singleSelect', options: AVAILABILITY },
      ],
    };
  }

  async listItems(
    filters: RoadmapItemFilters = {},
  ): Promise<RoadmapItemsResponse> {
    return { items: this.items.filter(item => matches(item, filters)) };
  }

  async getItem(id: string): Promise<RoadmapItemDetailResponse> {
    const item = this.items.find(candidate => candidate.id === id);
    if (!item) {
      const error = new Error(`No board item ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }
    return {
      item: {
        number: item.number ?? '',
        title: item.title,
        url: item.url ?? '',
        repository: {
          nameWithOwner: 'giantswarm/roadmap',
          isPrivate: false,
          url: 'https://github.com/giantswarm/roadmap',
        },
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
        assignees: item.assignees ?? [],
        comments: [],
        labels: [],
        projects: ['Roadmap'],
        fields: Object.entries(item.fields).map(([name, value]) => ({
          name,
          value,
        })),
        createdAt: item.createdAt ?? null,
        updatedAt: item.updatedAt ?? null,
        closedAt: null,
      },
    };
  }

  async getOverview(team?: string): Promise<RoadmapOverviewResponse> {
    const items = this.items.filter(item => matches(item, { team }));
    const byStatus: Record<string, number> = {};
    for (const item of items) {
      byStatus[item.fields.Status] = (byStatus[item.fields.Status] ?? 0) + 1;
    }
    return {
      total: items.length,
      byStatus,
      byRepo: { 'giantswarm/roadmap': items.length },
    };
  }

  async listSubIssues(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<RoadmapSubIssuesResponse> {
    const done = issueNumber % 3;
    return {
      parent: null,
      subIssues: Array.from({ length: 3 + (issueNumber % 3) }, (_, i) => ({
        id: issueNumber * 10 + i,
        number: issueNumber * 10 + i,
        title: `Fixture sub-issue ${i + 1}`,
        state: i < done ? 'closed' : 'open',
        htmlUrl: `https://github.com/${owner}/${repo}/issues/${issueNumber}`,
        assignees: [],
        repo: `${owner}/${repo}`,
      })),
    };
  }

  async updateItemField(id: string, name: string, value: string) {
    this.items = this.items.map(item =>
      item.id === id
        ? { ...item, fields: { ...item.fields, [name]: value } }
        : item,
    );
  }

  async addSubIssue() {
    throw new Error('The fixture board does not change sub-issues.');
  }

  async removeSubIssue() {
    throw new Error('The fixture board does not change sub-issues.');
  }
}
