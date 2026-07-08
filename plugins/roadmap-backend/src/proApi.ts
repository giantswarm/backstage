/**
 * Typed surface of the `@giantswarm/pro` board core that the roadmap
 * backend uses. The package ships plain ESM JavaScript without type
 * declarations; this interface (together with the module declaration in
 * `giantswarm-pro.d.ts`) types the subset we call. The router receives an
 * implementation of this interface, so tests can inject a fake without
 * loading the real package.
 */

export interface ProBoardField {
  __typename: string;
  id: string;
  name: string;
  dataType?: string;
  options?: Array<{ id: string; name: string }>;
  configuration?: {
    iterations?: Array<{ id: string; title: string; startDate?: string }>;
  };
}

export interface ProListItem {
  id: string;
  title: string;
  number?: number;
  url?: string;
  repo: string | null;
  private: boolean | null;
  fields: Record<string, string>;
  assignees?: string[];
  labels?: string[];
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

export interface ProListItemsOptions {
  boardId: string;
  repository?: string | null;
  filters?: Record<string, string>;
  emptyFields?: string[];
  assignee?: string | null;
  label?: string | null;
  state?: string | null;
  keyword?: string | null;
  updated?: string | null;
  reason?: string | null;
  token?: string;
}

export interface ProListItemsResult {
  status: 'success' | 'error';
  data?: ProListItem[];
  error?: string;
}

/** GitHub REST issue shape (the fields the sub-issue endpoints use). */
export interface ProRestIssue {
  id: number;
  number: number;
  title: string;
  state: string;
  html_url: string;
  assignees?: Array<{ login: string }> | null;
  repository_url?: string;
}

export interface ProSubIssueTarget {
  owner: string;
  repo: string;
  issue_number: number;
}

export interface ProApi {
  resolveBoardId(boardKey?: string): string;
  listItems(options: ProListItemsOptions): Promise<ProListItemsResult>;
  getItemByID(itemId: string, token?: string): Promise<ProItemDetail>;
  updateItemField(
    itemId: string,
    fieldId: string,
    value: Record<string, unknown>,
    boardId: string,
    token?: string,
  ): Promise<unknown>;
  listFields(boardId: string, token?: string): Promise<ProBoardField[]>;
  findFieldByName(
    fieldName: string,
    boardId: string,
    token?: string,
  ): Promise<ProBoardField | null>;
  findMatchingOption(
    options: Array<{ id: string; name: string }>,
    optionName: string,
  ): { id: string; name: string } | null;
  findMatchingIteration(
    field: ProBoardField,
    value: string,
  ): { id: string; title: string } | null;
  listSubIssues(
    target: ProSubIssueTarget & { per_page?: number; page?: number },
    token?: string,
  ): Promise<ProRestIssue[]>;
  addSubIssue(
    target: ProSubIssueTarget & { subIssueId: number; replaceParent?: boolean },
    token?: string,
  ): Promise<ProRestIssue>;
  removeSubIssue(
    target: ProSubIssueTarget & { subIssueId: number },
    token?: string,
  ): Promise<void>;
  getParentIssue(
    target: ProSubIssueTarget,
    token?: string,
  ): Promise<ProRestIssue | null>;
  parseIssueRef(input: string): ProSubIssueTarget;
  resolveIssueId(
    ownerOrRef: string,
    repo?: string | { token?: string },
    issueNumber?: number,
    options?: { token?: string },
  ): Promise<{
    id: number;
    number: number;
    title: string;
    state: string;
    html_url: string;
    repository: string;
  }>;
  graphQLWithAuth(
    query: string,
    variables?: Record<string, unknown>,
    token?: string,
  ): Promise<unknown>;
}
