/**
 * Types mirroring the roadmap-backend REST responses
 * (plugins/roadmap-backend/src/router.ts).
 */

export interface BoardFieldSchema {
  name: string;
  type: 'singleSelect' | 'iteration' | 'date' | 'text' | 'other';
  options?: string[];
  iterations?: string[];
}

export interface RoadmapSchemaResponse {
  board: string;
  fields: BoardFieldSchema[];
}

export interface BoardItem {
  /** GitHub project item node id -- the key for detail views and updates. */
  id: string;
  title: string;
  number?: number;
  url?: string;
  repo: string | null;
  private: boolean | null;
  /** Single-select field values by field name (e.g. Status, Kind, Team). */
  fields: Record<string, string>;
  assignees?: string[];
  labels?: string[];
}

export interface RoadmapItemsResponse {
  items: BoardItem[];
}

export interface BoardItemDetail {
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
  /** All field values, including iteration and date fields. */
  fields: Array<{ name: string; value: string }>;
  createdAt: string | null;
  updatedAt: string | null;
  closedAt: string | null;
}

export interface RoadmapItemResponse {
  item: BoardItemDetail;
}

export interface SubIssue {
  /** GitHub issue integer id (used for unlinking). */
  id: number;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  assignees: string[];
  repo?: string;
}

export interface RoadmapSubIssuesResponse {
  subIssues: SubIssue[];
  parent: SubIssue | null;
}

export interface ItemFilters {
  team?: string;
  status?: string;
  kind?: string;
  availability?: string;
  quarter?: string;
  assignee?: string;
  keyword?: string;
  state?: string;
  updated?: string;
  repository?: string;
}

export interface RoadmapApi {
  getSchema(): Promise<RoadmapSchemaResponse>;
  listItems(filters?: ItemFilters): Promise<RoadmapItemsResponse>;
  getItem(itemId: string): Promise<RoadmapItemResponse>;
  /** Resolve an issue URL or `owner/repo#N` ref to its board item id. */
  resolveItem(issue: string): Promise<{ itemId: string }>;
  getSubIssues(
    owner: string,
    repo: string,
    number: number,
  ): Promise<RoadmapSubIssuesResponse>;
  updateItemField(itemId: string, name: string, value: string): Promise<void>;
  addSubIssue(
    owner: string,
    repo: string,
    number: number,
    child: string,
  ): Promise<void>;
  removeSubIssue(
    owner: string,
    repo: string,
    number: number,
    subIssueId: number,
  ): Promise<void>;
}
