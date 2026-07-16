/**
 * Type declarations for `@giantswarm-io/pro`, which ships plain ESM
 * JavaScript without TypeScript types. Only the surface consumed by this
 * plugin is declared; see the package's `src/index.js` for the full export
 * list.
 */
declare module '@giantswarm-io/pro' {
  export const BOARDS: Record<string, { id: string; name: string }>;
  export const DEFAULT_BOARD: string;
  export function resolveBoardId(boardKey?: string): string;

  export interface ProFieldOption {
    id: string;
    name: string;
    color?: string;
    description?: string;
  }

  export interface ProIteration {
    id: string;
    title: string;
    startDate?: string;
    duration?: number;
  }

  export interface ProField {
    __typename: string;
    id: string;
    name: string;
    dataType?: string;
    options?: ProFieldOption[];
    configuration?: { iterations?: ProIteration[] };
  }

  export interface ProListItem {
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
    fields: Record<string, string>;
  }

  export interface ProListResult {
    status: 'success' | 'error';
    data?: ProListItem[];
    error?: string;
  }

  export interface ProListOptions {
    boardId: string;
    repository?: string | null;
    filters?: Record<string, string>;
    emptyFields?: string[];
    assignee?: string | null;
    label?: string | null;
    state?: string | null;
    keyword?: string | null;
    updated?: string | null;
    created?: string | null;
    closed?: string | null;
    reason?: string | null;
    token?: string;
  }

  export interface ProItemDetail {
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
    fields: Array<{ name: string; value: string }>;
    createdAt: string | null;
    updatedAt: string | null;
    closedAt: string | null;
  }

  export function listItems(options: ProListOptions): Promise<ProListResult>;
  export function getItemByID(
    itemId: string,
    token?: string,
  ): Promise<ProItemDetail>;
  export function updateItemField(
    itemId: string,
    fieldId: string,
    value: Record<string, string>,
    boardId: string,
    token?: string,
  ): Promise<unknown>;

  export function listFields(
    boardId: string,
    token?: string,
  ): Promise<ProField[]>;
  export function findFieldByName(
    fieldName: string,
    boardId: string,
    token?: string,
  ): Promise<ProField | null>;
  export function findMatchingOption(
    options: ProFieldOption[],
    optionName: string,
  ): ProFieldOption | null;
  export function findMatchingIteration(
    field: ProField,
    value: string,
  ): ProIteration | null;

  /** GitHub REST issue shape (the fields this plugin maps). */
  export interface ProRestIssue {
    id: number;
    number: number;
    title: string;
    state: string;
    html_url: string;
    assignees?: Array<{ login: string }> | null;
    repository_url?: string;
  }

  export interface ProIssueTarget {
    owner: string;
    repo: string;
    issue_number: number;
  }

  export function listSubIssues(
    target: ProIssueTarget & { per_page?: number; page?: number },
    token?: string,
  ): Promise<ProRestIssue[]>;
  export function addSubIssue(
    target: ProIssueTarget & { subIssueId: number; replaceParent?: boolean },
    token?: string,
  ): Promise<ProRestIssue>;
  export function removeSubIssue(
    target: ProIssueTarget & { subIssueId: number },
    token?: string,
  ): Promise<void>;
  export function getParentIssue(
    target: ProIssueTarget,
    token?: string,
  ): Promise<ProRestIssue | null>;

  export function parseIssueRef(input: string): ProIssueTarget;
  export function resolveIssueId(
    ref: string,
    options?: { token?: string },
  ): Promise<{
    id: number;
    number: number;
    title: string;
    state: string;
    html_url: string;
    repository: string;
  }>;

  export function graphQLWithAuth<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
    token?: string,
  ): Promise<T>;

  /** Authenticated Octokit REST client (only `request` is consumed here). */
  export function getOctokit(token?: string): {
    request<T = unknown>(
      route: string,
      params?: Record<string, unknown>,
    ): Promise<{ data: T }>;
  };
}
