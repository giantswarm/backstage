import { githubGraphql, isUnreadableRepoError } from '../util/githubGraphql';
import type { ProjectSlug } from '../util/projectSlug';
import type { RepoContent } from './repoContentStore';

/**
 * Repositories asked for in one query, as aliases. Keeps a query well inside
 * GitHub's node and timeout limits.
 */
export const BATCH_SIZE = 25;

const FIELDS = `
fragment RepoContentFields on Repository {
  defaultBranchRef { name }
  readme: object(expression: "HEAD:README.md") { __typename }
}`;

type RepoNode = {
  defaultBranchRef: { name: string } | null;
  readme: { __typename: string } | null;
};

export type BatchResult = {
  /** Keyed by `owner/repo`. */
  content: Map<string, RepoContent>;
  /** Renamed, deleted or outside the token's reach. */
  unreadable: string[];
  /** Asked for but not answered; to be asked again next run. */
  failed: string[];
};

function buildQuery(count: number): string {
  const params: string[] = [];
  const fields: string[] = [];
  for (let i = 0; i < count; i++) {
    params.push(`$o${i}: String!`, `$n${i}: String!`);
    fields.push(
      `  r${i}: repository(owner: $o${i}, name: $n${i}) { ...RepoContentFields }`,
    );
  }
  return `query RepoContent(${params.join(', ')}) {\n${fields.join('\n')}\n}\n${FIELDS}`;
}

function toRepoContent(node: RepoNode): RepoContent {
  const content: RepoContent = { hasReadme: node.readme !== null };
  if (node.defaultBranchRef) {
    content.defaultBranch = node.defaultBranchRef.name;
  }
  return content;
}

/**
 * Fetches `RepoContent` for up to `BATCH_SIZE` repositories of one owner in a
 * single GraphQL query. Throws when the query as a whole fails; per-repository
 * errors are sorted into `unreadable` and `failed`.
 */
export async function fetchRepoContentBatch(options: {
  slugs: ProjectSlug[];
  token: string;
  fetchImpl: typeof fetch;
}): Promise<BatchResult> {
  const { slugs, token, fetchImpl } = options;
  const variables: Record<string, string> = {};
  slugs.forEach((slug, i) => {
    variables[`o${i}`] = slug.owner;
    variables[`n${i}`] = slug.repo;
  });

  const body = await githubGraphql<Record<string, RepoNode | null>>({
    query: buildQuery(slugs.length),
    variables,
    token,
    fetchImpl,
  });

  const unaliased = body.errors?.filter(e => !e.path?.length) ?? [];
  if (unaliased.length > 0) {
    throw new Error(
      `GitHub GraphQL errors: ${unaliased.map(e => e.message).join('; ')}`,
    );
  }

  const result: BatchResult = {
    content: new Map(),
    unreadable: [],
    failed: [],
  };
  slugs.forEach((slug, i) => {
    const key = `${slug.owner}/${slug.repo}`;
    const errors = body.errors?.filter(e => e.path?.[0] === `r${i}`) ?? [];
    const node = body.data?.[`r${i}`];
    if (errors.some(isUnreadableRepoError)) {
      result.unreadable.push(key);
    } else if (errors.length > 0 || !node) {
      result.failed.push(key);
    } else {
      result.content.set(key, toRepoContent(node));
    }
  });
  return result;
}
