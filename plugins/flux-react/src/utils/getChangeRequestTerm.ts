export type ChangeRequestTerm = 'pull request' | 'merge request';

/**
 * The host of a GitRepository `spec.url`: `https://`, `ssh://git@…` or the
 * scp-like `git@host:path` form.
 */
function getGitHost(gitRepositoryUrl: string): string | undefined {
  const match = gitRepositoryUrl.match(
    /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?(?<host>[^:/]+)/i,
  );
  return match?.groups?.host.toLowerCase();
}

/**
 * What the Git host of a GitRepository calls a proposed change: GitLab says
 * "merge request"; GitHub, Bitbucket, Azure DevOps and Gitea say "pull
 * request". Decided by hostname, so a self-hosted GitLab without "gitlab" in
 * its hostname gets "pull request".
 */
export function getChangeRequestTerm(
  gitRepositoryUrl: string,
): ChangeRequestTerm {
  return getGitHost(gitRepositoryUrl)?.includes('gitlab')
    ? 'merge request'
    : 'pull request';
}
