import { graphql } from '@octokit/graphql';

type GraphQL = typeof graphql;

type QueryResponse = {
  repositoryOwner?: RepositoryOwnerResponse;
};

type PageInfo = {
  hasNextPage: boolean;
  endCursor?: string;
};

type Connection<T> = {
  pageInfo: PageInfo;
  nodes: T[];
};

type RepositoryOwnerResponse = {
  repositories?: Connection<RepositoryResponse>;
  repository?: RepositoryResponse;
};

type RepositoryResponse = {
  releases?: Connection<ReleaseResponse>;
};

export type ReleaseResponse = {
  name: string;
  createdAt: string;
};

export async function getRepositoryLatestRelease(
  client: GraphQL,
  org: string,
  repoName: string,
): Promise<ReleaseResponse | null> {
  const query = `
    query latestRelease($org: String!, $repoName: String!) {
      repositoryOwner(login: $org) {
        repository(name: $repoName) {
          releases(first: 1, orderBy: {field: CREATED_AT, direction: DESC}) {
            nodes {
              name
              createdAt
            }
          }
        }
      }
    }`;

  const response: QueryResponse = await client(query, {
    org,
    repoName,
  });

  return response.repositoryOwner?.repository?.releases?.nodes?.[0] || null;
}
