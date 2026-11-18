import { FIXTURE_INSTALLATION } from '@giantswarm/backstage-plugin-gs-common';
import {
  fixtureScenario,
  withFixtureScenario,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

import { fixtureBoard, type FixtureBoard } from './roadmapBoardFixtures';
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
 * detail render without muster and the GitHub board. The board is the page's
 * fixture scenario's (`roadmapBoardFixtures.ts`). A status move changes the
 * board until the page reloads.
 */

const FIELD_NAMES = {
  team: 'Team',
  status: 'Status',
  kind: 'Kind',
  availability: 'Availability',
};

const DAY = 86_400_000;

/**
 * The earliest update time an `updated` filter lets through, as GitHub
 * search reads `>` or `>=` with a date or `@today-Nd`, in whole UTC days.
 * Any other filter lets every item through, with a console warning.
 */
function updatedSince(updated: string | undefined): number | undefined {
  if (!updated) {
    return undefined;
  }
  const match = updated.match(
    /^(>=?)(?:@today(?:-(\d+)d)?|(\d{4}-\d{2}-\d{2}))$/,
  );
  if (!match) {
    // eslint-disable-next-line no-console
    console.warn(
      `The fixture RoadmapApi cannot read the updated filter ${updated}: it lists every item.`,
    );
    return undefined;
  }
  const [, operator, days, date] = match;
  const today = Math.floor(Date.now() / DAY) * DAY;
  const day = date ? Date.parse(date) : today - Number(days ?? 0) * DAY;
  return operator === '>' ? day + DAY : day;
}

function matches(item: RoadmapItem, filters: RoadmapItemFilters): boolean {
  const field = (name: string, value?: string) =>
    !value || item.fields[name] === value;
  const keyword = filters.keyword?.toLowerCase();
  const since = updatedSince(filters.updated);
  return (
    (!filters.empty || !item.fields[FIELD_NAMES[filters.empty]]) &&
    field('Team', filters.team) &&
    field('Status', filters.status) &&
    field('Kind', filters.kind) &&
    field('Quarter', filters.quarter) &&
    field('Availability', filters.availability) &&
    (!keyword || item.title.toLowerCase().includes(keyword)) &&
    (since === undefined || Date.parse(item.updatedAt ?? '') >= since)
  );
}

export class RoadmapFixtureApi implements RoadmapApi {
  private readonly board: FixtureBoard;
  private items: RoadmapItem[];

  constructor(board: FixtureBoard = fixtureBoard(fixtureScenario())) {
    this.board = board;
    this.items = board.items;
  }

  async getConnection(): Promise<RoadmapConnectionResponse> {
    return { connected: true };
  }

  async getSchema(): Promise<RoadmapSchemaResponse> {
    return this.board.schema;
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
    const repository = item.repo ?? 'giantswarm/roadmap';
    return {
      item: {
        ...this.board.detailOf(item),
        number: item.number ?? '',
        title: item.title,
        url: item.url ?? '',
        repository: {
          nameWithOwner: repository,
          isPrivate: false,
          url: `https://github.com/${repository}`,
        },
        assignees: item.assignees ?? [],
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
    // As roadmap-backend's `/overview` counts them.
    const byStatus: Record<string, number> = {};
    const byRepo: Record<string, number> = {};
    for (const item of items) {
      const status = item.fields.Status ?? 'No status';
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      const repo = item.repo ?? 'unknown';
      byRepo[repo] = (byRepo[repo] ?? 0) + 1;
    }
    return { total: items.length, byStatus, byRepo };
  }

  async listSubIssues(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<RoadmapSubIssuesResponse> {
    return {
      parent: null,
      subIssues: this.board.subIssuesOf(owner, repo, issueNumber),
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

/**
 * The 503 roadmap-backend answers when the board's muster cannot be reached
 * (gs-node's `MusterUnreachableError`), as the client reads it.
 */
function musterUnreachableError(): Error {
  return Object.assign(
    new Error(`${FIXTURE_INSTALLATION} did not answer: the connection failed`),
    { name: 'ServiceUnavailableError' },
  );
}

/**
 * The fixture `RoadmapApi`, as the page's fixture scenario serves it: in
 * `loading` no call answers, in `error` every call fails as roadmap-backend
 * answers when muster is not reachable.
 */
export function roadmapFixtureApi(): RoadmapApi {
  return withFixtureScenario(
    'RoadmapApi',
    new RoadmapFixtureApi(),
    musterUnreachableError,
  );
}
