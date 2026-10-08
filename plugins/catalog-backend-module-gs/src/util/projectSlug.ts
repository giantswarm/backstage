export type ProjectSlug = { owner: string; repo: string };

/**
 * Parses a `github.com/project-slug` annotation, strictly: a slug with extra
 * segments — a pasted URL path like `giantswarm/my-repo/tree/main`, or
 * `giantswarm/sub/repo` — would otherwise silently resolve to a different
 * repo, and we would publish data about a repo that is not this component.
 */
export function parseProjectSlug(slug?: string): ProjectSlug | undefined {
  if (!slug) {
    return undefined;
  }
  const segments = slug.split('/');
  if (segments.length !== 2 || !segments[0] || !segments[1]) {
    return undefined;
  }
  return { owner: segments[0], repo: segments[1] };
}
