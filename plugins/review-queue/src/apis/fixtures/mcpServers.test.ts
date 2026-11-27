import {
  ciStateOf,
  classifyGithubError,
  DEFAULT_FILTERS,
  GITHUB_TOOLS,
  GithubRateLimitError,
  mergeStateOf,
  requestQuery,
  reviewStateOf,
  sectionQuery,
  type CheckRunsAnswer,
  type CombinedStatusAnswer,
  type Filters,
  type PullAnswer,
  type Review,
} from '../../lib/github';
import { BASE_PRS, ciOf, manyPrs, reviewsOf } from './githubFixtureData';
import { SLACK_TOOLS } from '../../lib/slack';
import {
  githubFixtureServer,
  slackFixtureServer,
  pullReadFixture,
  RATE_LIMITED_TEAM,
  searchFixture,
} from './mcpServers';

const NONE: Filters = {
  hideBots: false,
  hideDrafts: false,
  orgOnly: false,
  hideArchived: false,
};

const numbers = (query: string) =>
  searchFixture(query, BASE_PRS).items.map(item => item.number);

describe('github fixture server', () => {
  it('answers every tool the tab calls', () => {
    // ReviewsClient calls each of GITHUB_TOOLS; a tool added there needs a
    // handler here, or fixture mode fails the call.
    expect(Object.keys(githubFixtureServer.tools).sort()).toEqual(
      Object.values(GITHUB_TOOLS).sort(),
    );
    // SlackClient calls each of SLACK_TOOLS.
    expect(Object.keys(slackFixtureServer.tools).sort()).toEqual(
      Object.values(SLACK_TOOLS).sort(),
    );
  });

  it('serves each section from its list, oldest first', () => {
    const waiting = numbers(sectionQuery('waiting', NONE));
    expect(waiting.length).toBeGreaterThan(3);
    const items = searchFixture(sectionQuery('waiting', NONE), BASE_PRS).items;
    const created = items.map(item => item.created_at);
    expect(created).toEqual([...created].sort());
    expect(numbers(sectionQuery('mine', NONE))).toEqual(
      expect.arrayContaining([301, 640, 399]),
    );
  });

  it('leaves out what the filters leave out', () => {
    const all = numbers(sectionQuery('waiting', NONE));
    const filtered = numbers(sectionQuery('waiting', DEFAULT_FILTERS));
    // taylorbot by the query; the draft by `draft:false`.
    expect(all).toEqual(expect.arrayContaining([657, 3661]));
    expect(filtered).not.toContain(657);
    expect(filtered).not.toContain(3661);
    // A GitHub App the query does not name gets through, for the page to drop.
    expect(filtered).toContain(852);
  });

  it('answers the requests that name you', () => {
    expect(
      numbers(requestQuery({ kind: 'you' }, NONE)).sort((a, b) => a - b),
    ).toEqual([512, 1412]);
  });

  it("refuses Hive's Up team for rate, as GitHub words it", () => {
    let error: unknown;
    try {
      searchFixture(sectionQuery('team', NONE, RATE_LIMITED_TEAM), BASE_PRS);
    } catch (thrown) {
      error = thrown;
    }
    const classified = classifyGithubError(error);
    expect(classified).toBeInstanceOf(GithubRateLimitError);
    expect((classified as GithubRateLimitError).resetAt).toBeDefined();
  });

  it('counts past one page in many', () => {
    const answer = searchFixture(sectionQuery('waiting', NONE), manyPrs());
    expect(answer.items).toHaveLength(100);
    expect(answer.total_count).toBe(143);
  });

  it('shows every icon value in the base data set', () => {
    const states = BASE_PRS.map(pr => {
      const { checkRuns, statuses } = ciOf(pr);
      return {
        ci: ciStateOf(checkRuns, statuses).state,
        review: reviewStateOf(reviewsOf(pr)).state,
        merge: mergeStateOf(pr.merge).state,
      };
    });
    const values = (key: 'ci' | 'review' | 'merge') =>
      new Set(states.map(state => state[key]));
    expect(values('ci')).toEqual(
      new Set(['passing', 'failing', 'running', 'none']),
    );
    expect(values('review')).toEqual(
      new Set(['approved', 'changes_requested', 'none']),
    );
    expect(values('merge')).toEqual(
      new Set(['ready', 'conflicts', 'blocked', 'behind', 'draft', 'checking']),
    );
  });

  it('answers the four reads of a PR', () => {
    const args = { owner: 'giantswarm', repo: 'dex-app', pullNumber: 640 };
    const pull = pullReadFixture(
      { ...args, method: 'get' },
      BASE_PRS,
    ) as PullAnswer;
    expect(pull.mergeable_state).toBe('blocked');
    const runs = pullReadFixture(
      { ...args, method: 'get_check_runs' },
      BASE_PRS,
    ) as CheckRunsAnswer;
    const status = pullReadFixture(
      { ...args, method: 'get_status' },
      BASE_PRS,
    ) as CombinedStatusAnswer;
    expect(ciStateOf(runs.check_runs ?? [], status.statuses ?? []).state).toBe(
      'failing',
    );
    expect(
      pullReadFixture({ ...args, method: 'get_reviews' }, BASE_PRS) as Review[],
    ).toHaveLength(1);
    expect(() =>
      pullReadFixture({ ...args, pullNumber: 1, method: 'get' }, BASE_PRS),
    ).toThrow(/404/);
  });
});
