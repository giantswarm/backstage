/**
 * Types mirroring the plans-backend REST proxy responses
 * (plugins/plans-backend/src/router.ts).
 */

export interface PlansReposResponse {
  repositories: string[];
}

export interface PlanPull {
  number: number;
  title: string;
  author?: string;
  draft: boolean;
  branch?: string;
  updatedAt?: string;
  body: string;
}

export interface PlansPullsResponse {
  pulls: PlanPull[];
}

export interface PlanPullFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  /** GitHub unified diff text; absent for binary or very large files. */
  patch?: string;
  previousFilename?: string;
}

export interface PlansPullFilesResponse {
  files: PlanPullFile[];
}

export interface PlanTreeEntry {
  path?: string;
  type?: string;
  size?: number;
}

export interface PlansTreeResponse {
  truncated: boolean;
  tree: PlanTreeEntry[];
}

export interface PlansContentResponse {
  path: string;
  ref: string;
  content: string;
}

/** A general PR discussion comment (GitHub issue comment). */
export interface PlanComment {
  id: number;
  author?: string;
  body: string;
  createdAt?: string;
  htmlUrl?: string;
}

/** An inline review comment anchored to a diff line. */
export interface PlanReviewComment extends PlanComment {
  path?: string;
  line?: number;
  side?: string;
  inReplyTo?: number;
}

export interface PlansCommentsResponse {
  comments: PlanComment[];
}

export interface PlansReviewCommentsResponse {
  comments: PlanReviewComment[];
}

export interface NewReviewComment {
  body: string;
  /** Required when starting a new thread. */
  path?: string;
  /** New-file (RIGHT side) line number; required when starting a new thread. */
  line?: number;
  /** Reply to an existing review comment instead of starting a thread. */
  inReplyTo?: number;
}

export interface PlansApi {
  listRepos(): Promise<PlansReposResponse>;
  listPulls(repo?: string): Promise<PlansPullsResponse>;
  listPullFiles(
    pullNumber: number,
    repo?: string,
  ): Promise<PlansPullFilesResponse>;
  getTree(ref?: string, repo?: string): Promise<PlansTreeResponse>;
  getContent(
    path: string,
    ref?: string,
    repo?: string,
  ): Promise<PlansContentResponse>;
  listPullComments(
    pullNumber: number,
    repo?: string,
  ): Promise<PlansCommentsResponse>;
  createPullComment(
    pullNumber: number,
    body: string,
    repo?: string,
  ): Promise<PlanComment>;
  listReviewComments(
    pullNumber: number,
    repo?: string,
  ): Promise<PlansReviewCommentsResponse>;
  createReviewComment(
    pullNumber: number,
    comment: NewReviewComment,
    repo?: string,
  ): Promise<PlanReviewComment>;
}
