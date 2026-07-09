/**
 * Types mirroring the roadmap-backend REST proxy responses
 * (plugins/roadmap-backend/src/router.ts).
 */

/** Compact field description served by GET /schema for the filter UI. */
export interface RoadmapField {
  name: string;
  type: 'singleSelect' | 'iteration' | 'date' | 'text' | 'other';
  options?: string[];
  iterations?: string[];
}

export interface RoadmapSchemaResponse {
  board: string;
  defaultTeams: string[];
  fields: RoadmapField[];
}

/** A board item from GET /items (pro's ProListItem shape). */
export interface RoadmapItem {
  id: string;
  title: string;
  number?: number;
  url?: string;
  repo: string | null;
  private: boolean | null;
  state?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  closedAt?: string;
  assignees?: string[];
  labels?: string[];
  /** Board field values keyed by human-readable field name (e.g. "Status"). */
  fields: Record<string, string>;
}

export interface RoadmapItemsResponse {
  items: RoadmapItem[];
}

export interface RoadmapOverviewResponse {
  total: number;
  byStatus: Record<string, number>;
  byRepo: Record<string, number>;
}

/** Item detail from GET /items/:id (pro's ProItemDetail shape). */
export interface RoadmapItemDetail {
  number: number | '';
  title: string;
  url: string;
  repository: {
    nameWithOwner: string;
    isPrivate: boolean;
    url: string;
  } | null;
  body: string;
  author: string;
  assignees: string[];
  comments: Array<{ body: string; createdAt: string; author: string }>;
  labels: string[];
  projects: string[];
  /** Board field values as an array (unlike the list shape's map). */
  fields: Array<{ name: string; value: string }>;
  createdAt: string | null;
  updatedAt: string | null;
  closedAt: string | null;
}

export interface RoadmapItemDetailResponse {
  item: RoadmapItemDetail;
}

/** A GitHub issue in a sub-issue tree (mapped REST shape). */
export interface RoadmapIssue {
  /** Integer issue ID -- what DELETE sub-issues expects, not the number. */
  id: number;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  assignees: string[];
  repo?: string;
}

export interface RoadmapSubIssuesResponse {
  subIssues: RoadmapIssue[];
  parent: RoadmapIssue | null;
}

export interface RoadmapItemFilters {
  team?: string;
  status?: string;
  kind?: string;
  availability?: string;
  quarter?: string;
  assignee?: string;
  state?: string;
  updated?: string;
  repository?: string;
  keyword?: string;
}

export interface RoadmapApi {
  getSchema(): Promise<RoadmapSchemaResponse>;
  listItems(filters?: RoadmapItemFilters): Promise<RoadmapItemsResponse>;
  getItem(id: string): Promise<RoadmapItemDetailResponse>;
  getOverview(team?: string): Promise<RoadmapOverviewResponse>;
  listSubIssues(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<RoadmapSubIssuesResponse>;
  updateItemField(id: string, name: string, value: string): Promise<void>;
  addSubIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    child: string,
  ): Promise<void>;
  removeSubIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    subIssueId: number,
  ): Promise<void>;
}
