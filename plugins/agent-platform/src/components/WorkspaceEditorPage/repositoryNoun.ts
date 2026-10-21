/**
 * What a provider calls a repository, for counts: GitLab's "project",
 * everyone else's "repository".
 */
export function repositoryNoun(
  kind: string | undefined,
  count: number,
): string {
  if (kind?.toLowerCase() === 'gitlab') {
    return count === 1 ? 'project' : 'projects';
  }
  return count === 1 ? 'repository' : 'repositories';
}
