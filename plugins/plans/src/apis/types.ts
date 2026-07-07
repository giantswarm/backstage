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
}
