import {
  musterUnauthorizedInfoOf,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import {
  ciStateOf,
  classifyGithubError,
  GithubNotConnectedError,
  GITHUB_TOOLS,
  githubToolName,
  mergeStateOf,
  reviewStateOf,
  SEARCH_FIELDS,
  SEARCH_PAGE_SIZE,
  type CheckRunsAnswer,
  type CombinedStatusAnswer,
  type GithubTool,
  type PrRef,
  type PrState,
  type PullAnswer,
  type Review,
  type SearchAnswer,
} from '../lib/github';
import { createLimiter, type Limiter } from '../lib/limiter';

/**
 * How many reads of PR state run at once, for one person. Low on purpose:
 * GitHub's secondary rate limit refuses a burst from one user, and a long
 * list is four reads per PR.
 */
export const STATE_READ_CONCURRENCY = 2;

/**
 * How many searches run at once, for one person: one. GitHub's secondary
 * rate limit refuses a burst of concurrent requests from one user, and a load
 * of the tab is several searches at the same time otherwise.
 */
export const SEARCH_CONCURRENCY = 1;

/** How long to wait before reading a `mergeable_state` GitHub was still computing. */
export const MERGEABLE_RETRY_MS = 3_000;

const sleep = (ms: number) =>
  new Promise<void>(resolve => {
    setTimeout(resolve, ms);
  });

/**
 * GitHub's tools on one installation's muster, as the signed-in person.
 *
 * `musterApi.callTool()` sends the person's token for the installation's
 * muster, and muster runs each call with the person's own GitHub grant, so
 * the portal holds no credential and GitHub answers what the person can
 * see. The portal knows the server only as `x_github_<tool>`.
 */
export class ReviewsClient {
  private readonly limit: Limiter;
  private readonly searchLimit: Limiter = createLimiter(SEARCH_CONCURRENCY);
  private readonly mergeableRetryMs: number;

  constructor(
    private readonly musterApi: MusterApi,
    readonly installation: string,
    options: { concurrency?: number; mergeableRetryMs?: number } = {},
  ) {
    this.limit = createLimiter(options.concurrency ?? STATE_READ_CONCURRENCY);
    this.mergeableRetryMs = options.mergeableRetryMs ?? MERGEABLE_RETRY_MS;
  }

  private async call<T>(
    tool: GithubTool,
    args: Record<string, unknown>,
  ): Promise<T> {
    let result: unknown;
    try {
      result = await this.musterApi.callTool(
        githubToolName(tool),
        args,
        this.installation,
      );
    } catch (error) {
      // muster-backend's 401: the sign-in to `github` (or a refused token,
      // which the alert shows in muster's words).
      if (musterUnauthorizedInfoOf(error)) {
        throw new GithubNotConnectedError(
          (error as Error).message ?? String(error),
          { cause: error },
        );
      }
      throw classifyGithubError(error);
    }
    if (typeof result === 'string') {
      try {
        return JSON.parse(result) as T;
      } catch {
        // A tool error comes back as text: classify it as a failure would be.
        throw classifyGithubError(new Error(result));
      }
    }
    return result as T;
  }

  /**
   * One search page, oldest first: the longest-waiting PRs on top. The
   * searches of a load run one after the other ({@link SEARCH_CONCURRENCY}).
   */
  search(query: string): Promise<SearchAnswer> {
    return this.searchLimit(() =>
      this.call<SearchAnswer>(GITHUB_TOOLS.searchPullRequests, {
        query,
        perPage: SEARCH_PAGE_SIZE,
        sort: 'created',
        order: 'asc',
        fields: [...SEARCH_FIELDS],
      }),
    );
  }

  private read<T>(ref: PrRef, method: string): Promise<T> {
    return this.limit(() =>
      this.call<T>(GITHUB_TOOLS.pullRequestRead, {
        method,
        owner: ref.owner,
        repo: ref.repo,
        pullNumber: ref.number,
        ...(method === 'get' ? {} : { perPage: 100 }),
      }),
    );
  }

  /**
   * A PR's CI, review and merge state: four reads on GitHub's general API
   * budget, at most {@link STATE_READ_CONCURRENCY} of them at once across
   * every PR of the tab. A `mergeable_state` GitHub is still computing is
   * read once more a moment later.
   */
  async prState(ref: PrRef): Promise<PrState> {
    const [pull, checkRuns, status, reviews] = await Promise.all([
      this.read<PullAnswer>(ref, 'get'),
      this.read<CheckRunsAnswer>(ref, 'get_check_runs'),
      this.read<CombinedStatusAnswer>(ref, 'get_status'),
      this.read<Review[]>(ref, 'get_reviews'),
    ]);
    let merge = mergeStateOf(pull.mergeable_state);
    if (merge.state === 'checking') {
      await sleep(this.mergeableRetryMs);
      const again = await this.read<PullAnswer>(ref, 'get');
      merge = mergeStateOf(again.mergeable_state);
    }
    return {
      ci: ciStateOf(checkRuns.check_runs ?? [], status.statuses ?? []),
      review: reviewStateOf(Array.isArray(reviews) ? reviews : []),
      merge,
    };
  }
}
