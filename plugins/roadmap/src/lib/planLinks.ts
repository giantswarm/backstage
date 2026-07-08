/**
 * Plan-to-epic mapping helpers (the plans side lives in the plans plugin).
 *
 * By team convention every plan PRD links back to its epic, and the epic
 * body links to the plan -- either "proposed in <plans-repo>#N" while the
 * plan PR is open, or a path link once merged. These helpers find such
 * links in an epic's body so the item detail view can surface them as
 * in-portal links to the plans page.
 */

export interface PlanLink {
  /** `owner/repo` of the plans repository. */
  repo: string;
  /** Pull request number for proposed plans. */
  pullNumber?: number;
  /** Top-level plan directory for merged plans (from a blob/tree path). */
  planDir?: string;
  /** The matched URL as written in the body. */
  url: string;
}

/**
 * Find links to any of the configured plan repositories in a markdown body.
 * Matches PR links (proposed plans) and blob/tree path links (merged plans).
 */
export function findPlanLinks(
  body: string,
  planRepositories: string[],
): PlanLink[] {
  const links: PlanLink[] = [];
  const seen = new Set<string>();
  for (const repo of planRepositories) {
    const pattern = new RegExp(
      `https://github\\.com/${repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` +
        // `pull/<n>` (proposed) or `blob|tree/<ref>/<plan-dir>` (merged);
        // trailing sentence punctuation must not be swallowed into the URL.
        `(?:/(?:pull/(\\d+)(?:[/#][^\\s)]*)?|(?:blob|tree)/[^/\\s)]+/([^/\\s)]+)[^\\s)]*))?`,
      'g',
    );
    for (const match of body.matchAll(pattern)) {
      const url = match[0];
      if (seen.has(url)) {
        continue;
      }
      seen.add(url);
      links.push({
        repo,
        pullNumber: match[1] ? parseInt(match[1], 10) : undefined,
        planDir: match[2],
        url,
      });
    }
  }
  return links;
}

/**
 * In-portal plans-page URL for a plan link: proposed plans open the PR
 * review page, merged plans open the merged tab scoped to the repository.
 */
export function planPagePath(link: PlanLink): string {
  const repoParam = `repo=${encodeURIComponent(link.repo)}`;
  if (link.pullNumber) {
    return `/plans/pr/${link.pullNumber}?${repoParam}`;
  }
  return `/plans?${repoParam}`;
}
