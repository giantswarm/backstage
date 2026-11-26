import {
  ciStateOf,
  classifyGithubError,
  DEFAULT_FILTERS,
  GithubNotConnectedError,
  GithubRateLimitError,
  githubSearchUrl,
  githubToolName,
  HIVE_TEAMS,
  isBotLogin,
  mergeStateOf,
  rateLimitOf,
  requestQuery,
  reviewStateOf,
  rowOf,
  sectionQuery,
  teamSectionSlugs,
  teamSlugOf,
  type CheckRun,
  type Filters,
} from './github';

const NONE: Filters = {
  hideBots: false,
  hideDrafts: false,
  orgOnly: false,
  hideArchived: false,
};

describe('github', () => {
  it("names a tool as muster exposes the github server's tools", () => {
    expect(githubToolName('search_pull_requests')).toBe(
      'x_github_search_pull_requests',
    );
  });

  describe('team slugs', () => {
    it.each([
      ['Bumblebee🐝', 'team-bumblebee'],
      ['Atlas 🗺️', 'team-atlas'],
      ['Cabbage 🥬', 'team-cabbage'],
      ['Honey Badger 🦡', 'team-honeybadger'],
      ['Phoenix 🔥', 'team-phoenix'],
      ['Planeteers 🪐', 'team-planeteers'],
      ['Shield 🛡️', 'team-shield'],
      ['Up 🎈', 'team-up'],
    ])('maps %s to %s', (team, slug) => {
      expect(teamSlugOf(team)).toBe(slug);
    });

    it('covers every Hive team', () => {
      expect(HIVE_TEAMS).toHaveLength(8);
    });

    it("shows another team's queue, never one of mine", () => {
      expect(teamSectionSlugs('Shield 🛡️', ['team-shield'])).toEqual([]);
      expect(teamSectionSlugs('Atlas 🗺️', ['team-shield'])).toEqual([
        'team-atlas',
      ]);
    });

    it('shows every team but mine under All teams', () => {
      const slugs = teamSectionSlugs('all', ['team-shield']);
      expect(slugs).toHaveLength(7);
      expect(slugs).not.toContain('team-shield');
      expect(slugs).toContain('team-honeybadger');
    });
  });

  describe('queries', () => {
    it('builds each section without filters', () => {
      expect(sectionQuery('waiting', NONE)).toBe(
        'is:open review-requested:@me',
      );
      expect(sectionQuery('mine', NONE)).toBe(
        'is:open author:@me -review:approved',
      );
      expect(sectionQuery('reviewed', NONE)).toBe(
        'is:open reviewed-by:@me -author:@me',
      );
      expect(sectionQuery('team', NONE, 'team-atlas')).toBe(
        'is:open team-review-requested:giantswarm/team-atlas',
      );
    });

    it('adds every filter that is on', () => {
      expect(sectionQuery('waiting', DEFAULT_FILTERS)).toBe(
        'is:open review-requested:@me org:giantswarm archived:false draft:false -author:app/renovate -author:app/dependabot -author:taylorbot -author:architectbot',
      );
    });

    it('keeps my own drafts in "My PRs"', () => {
      expect(sectionQuery('mine', DEFAULT_FILTERS)).not.toContain(
        'draft:false',
      );
      expect(sectionQuery('reviewed', DEFAULT_FILTERS)).toContain(
        'draft:false',
      );
    });

    it.each(Object.keys(NONE) as (keyof Filters)[])(
      'adds only its own qualifier for %s',
      key => {
        const query = sectionQuery('waiting', { ...NONE, [key]: true });
        const added = query
          .replace('is:open review-requested:@me', '')
          .trim()
          .split(' ')[0];
        expect(
          {
            hideBots: '-author:app/renovate',
            hideDrafts: 'draft:false',
            orgOnly: 'org:giantswarm',
            hideArchived: 'archived:false',
          }[key],
        ).toBe(added);
      },
    );

    it('needs a team for the team section', () => {
      expect(() => sectionQuery('team', NONE)).toThrow();
    });

    it('asks who a request names', () => {
      expect(requestQuery({ kind: 'you' }, NONE)).toBe(
        'is:open user-review-requested:@me',
      );
      expect(requestQuery({ kind: 'team', slug: 'team-shield' }, NONE)).toBe(
        'is:open team-review-requested:giantswarm/team-shield',
      );
    });

    it('links the same search on github.com', () => {
      expect(githubSearchUrl('is:open author:@me')).toBe(
        'https://github.com/pulls?q=is%3Aopen%20author%3A%40me',
      );
    });
  });

  describe('rows', () => {
    it('reads a search result as the MCP server answers it', () => {
      expect(
        rowOf({
          number: 261,
          title: 'Annotate scan job',
          draft: false,
          html_url: 'https://github.com/giantswarm/trivy-operator-app/pull/261',
          user: { login: 'vxav' },
          labels: ['bug', { name: 'kind/fix' }],
          created_at: '2026-03-26T08:55:10Z',
          updated_at: '2026-11-19T21:00:34Z',
          repository_url:
            'https://api.github.com/repos/giantswarm/trivy-operator-app',
        }),
      ).toEqual({
        id: 'giantswarm/trivy-operator-app#261',
        owner: 'giantswarm',
        repo: 'trivy-operator-app',
        number: 261,
        title: 'Annotate scan job',
        url: 'https://github.com/giantswarm/trivy-operator-app/pull/261',
        author: 'vxav',
        isBot: false,
        draft: false,
        labels: ['bug', 'kind/fix'],
        createdAt: '2026-03-26T08:55:10Z',
        updatedAt: '2026-11-19T21:00:34Z',
      });
    });

    it.each([
      ['renovate[bot]', true],
      ['heraldbot[bot]', true],
      ['taylorbot', true],
      ['architectbot', true],
      ['vxav', false],
      ['botanist', false],
    ])('counts %s as a bot: %s', (login, isBot) => {
      expect(isBotLogin(login)).toBe(isBot);
    });
  });

  describe('CI', () => {
    const run = (
      id: number,
      name: string,
      status: string,
      conclusion?: string,
    ): CheckRun => ({ id, name, status, conclusion: conclusion ?? null });

    it('passes when every check and status passed', () => {
      expect(
        ciStateOf(
          [
            run(1, 'lint', 'completed', 'success'),
            run(2, 'x', 'completed', 'skipped'),
          ],
          [{ context: 'ci/circleci: build', state: 'success' }],
        ),
      ).toEqual({ state: 'passing', failing: [], running: 0, total: 3 });
    });

    it('counts only the latest run of a re-run check', () => {
      const ci = ciStateOf(
        [
          run(1, 'lint', 'completed', 'failure'),
          run(5, 'lint', 'completed', 'success'),
        ],
        [],
      );
      expect(ci.state).toBe('passing');
      expect(ci.total).toBe(1);
    });

    it('reads CircleCI from the commit statuses', () => {
      const ci = ciStateOf(
        [run(1, 'lint', 'completed', 'success')],
        [{ context: 'ci/circleci: go-build', state: 'failure' }],
      );
      expect(ci).toMatchObject({
        state: 'failing',
        failing: ['ci/circleci: go-build'],
      });
    });

    it('fails before it runs', () => {
      expect(
        ciStateOf(
          [run(1, 'a', 'in_progress'), run(2, 'b', 'completed', 'timed_out')],
          [],
        ).state,
      ).toBe('failing');
    });

    it('is running while anything runs', () => {
      expect(
        ciStateOf([], [{ context: 'ci/circleci: build', state: 'pending' }]),
      ).toMatchObject({ state: 'running', running: 1 });
    });

    it('has nothing to say without checks', () => {
      expect(ciStateOf([], []).state).toBe('none');
    });
  });

  describe('reviews', () => {
    const review = (login: string, state: string, at: string) => ({
      id: 0,
      state,
      user: { login },
      submitted_at: at,
    });

    it("counts each reviewer's latest decision", () => {
      expect(
        reviewStateOf([
          review('a', 'CHANGES_REQUESTED', '2026-01-01T00:00:00Z'),
          review('a', 'APPROVED', '2026-01-02T00:00:00Z'),
          review('b', 'APPROVED', '2026-01-01T00:00:00Z'),
          review('b', 'COMMENTED', '2026-01-03T00:00:00Z'),
        ]),
      ).toEqual({ state: 'approved', approvals: 2, changesBy: [] });
    });

    it('lets changes requested win over approvals', () => {
      expect(
        reviewStateOf([
          review('a', 'APPROVED', '2026-01-01T00:00:00Z'),
          review('b', 'CHANGES_REQUESTED', '2026-01-02T00:00:00Z'),
        ]),
      ).toEqual({ state: 'changes_requested', approvals: 1, changesBy: ['b'] });
    });

    it('takes a dismissed decision back', () => {
      expect(
        reviewStateOf([
          review('a', 'CHANGES_REQUESTED', '2026-01-01T00:00:00Z'),
          review('a', 'DISMISSED', '2026-01-02T00:00:00Z'),
        ]).state,
      ).toBe('none');
    });
  });

  describe('merge', () => {
    it.each([
      ['clean', 'ready'],
      ['unstable', 'ready'],
      ['has_hooks', 'ready'],
      ['dirty', 'conflicts'],
      ['blocked', 'blocked'],
      ['behind', 'behind'],
      ['draft', 'draft'],
      ['unknown', 'checking'],
      [undefined, 'checking'],
    ])('reads %s as %s', (raw, state) => {
      expect(mergeStateOf(raw).state).toBe(state);
    });
  });

  describe('errors', () => {
    const now = Date.parse('2026-11-26T10:00:00Z');

    it.each([
      ['[rate reset in 42s]', 42_000],
      ['[rate reset in 1m30s]', 90_000],
      ['[rate reset in 1h0m2.5s]', 3_602_500],
      ['[rate reset in 500ms]', 500],
    ])('reads go-github\'s reset "%s"', (tail, ms) => {
      const error = rateLimitOf(
        `403 API rate limit of 30 still exceeded, not making remote request. ${tail}`,
        now,
      );
      expect(error?.resetAt?.getTime()).toBe(now + ms);
    });

    it('knows a secondary rate limit without a reset time', () => {
      const error = rateLimitOf(
        'You have exceeded a secondary rate limit. Please wait a few minutes',
        now,
      );
      expect(error).toBeInstanceOf(GithubRateLimitError);
      expect(error?.resetAt).toBeUndefined();
    });

    it('is no rate limit otherwise', () => {
      expect(rateLimitOf('404 Not Found', now)).toBeUndefined();
    });

    it.each([
      "auth_required: server 'github' requires authentication",
      'tool not found: x_github_search_pull_requests',
      'Request failed with status 401',
    ])('reads "%s" as not connected', message => {
      expect(classifyGithubError(new Error(message))).toBeInstanceOf(
        GithubNotConnectedError,
      );
    });

    it('does not take a PR numbered 401 for a sign-in', () => {
      const error = new Error(
        'GET https://api.github.com/repos/giantswarm/x/pulls/401: 502 Bad Gateway',
      );
      expect(classifyGithubError(error)).toBe(error);
    });

    it('keeps any other error as it is', () => {
      const error = new Error('422 Validation Failed');
      expect(classifyGithubError(error)).toBe(error);
    });
  });
});
