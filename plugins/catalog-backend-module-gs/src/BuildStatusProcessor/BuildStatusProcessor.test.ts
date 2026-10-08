import { mockServices } from '@backstage/backend-test-utils';
import type { Entity } from '@backstage/catalog-model';
import {
  BUILD_FAILING,
  BUILD_PASSING,
  BUILD_UNKNOWN,
  BuildStatusProcessor,
  type CircleBuild,
  parseRollup,
  type Rollup,
  type RollupContext,
  verdict,
} from './BuildStatusProcessor';

const MAIN = 'main';
const CIRCLE_URL = 'https://circleci.com/gh/giantswarm/my-app/1234';
/** A green CircleCI build of main, as evidence that the build runs. */
const CIRCLE_MAIN_GREEN: RollupContext = {
  kind: 'status',
  context: 'ci/circleci: main',
  state: 'SUCCESS',
  targetUrl: 'https://circleci.com/gh/giantswarm/my-app/1200',
};

function check(
  name: string,
  conclusion: string | null,
  suiteBranch: string | null,
  detailsUrl: string | null = null,
): RollupContext {
  return { kind: 'check', name, conclusion, detailsUrl, suiteBranch };
}

function status(
  context: string,
  state: string,
  targetUrl: string | null = CIRCLE_URL,
): RollupContext {
  return { kind: 'status', context, state, targetUrl };
}

function rollup(contexts: RollupContext[], totalCount?: number): Rollup {
  return {
    defaultBranch: MAIN,
    totalCount: totalCount ?? contexts.length,
    contexts,
  };
}

function builds(
  entries: Record<string, CircleBuild | undefined>,
): Map<string, CircleBuild | undefined> {
  return new Map(Object.entries(entries));
}

describe('verdict', () => {
  it('counts a failing check run whose suite ran on the default branch', () => {
    expect(
      verdict(rollup([check('lint', 'FAILURE', MAIN)]), builds({})),
    ).toEqual({ status: BUILD_FAILING, failingChecks: ['lint'] });
  });

  it('does not count a failing check run from another branch', () => {
    // Same SHA, different branch: a branch cut off main, or a merge-queue
    // branch. Not main's failure.
    expect(
      verdict(
        rollup([
          check('lint', 'FAILURE', 'gh-readonly-queue/main/pr-1'),
          check('lint', 'SUCCESS', MAIN),
        ]),
        builds({}),
      ),
    ).toEqual({ status: BUILD_PASSING, failingChecks: [] });
  });

  it('counts a failing status whose CircleCI build ran on the default branch', () => {
    expect(
      verdict(
        rollup([status('ci/circleci: build', 'FAILURE')]),
        builds({ [CIRCLE_URL]: { branch: MAIN, outcome: 'failed' } }),
      ),
    ).toEqual({
      status: BUILD_FAILING,
      failingChecks: ['ci/circleci: build'],
    });
  });

  it('does not count a failing status whose build ran elsewhere', () => {
    expect(
      verdict(
        rollup([status('ci/circleci: build', 'FAILURE'), CIRCLE_MAIN_GREEN]),
        builds({
          [CIRCLE_URL]: { branch: 'renovate/deps', outcome: 'failed' },
        }),
      ),
    ).toEqual({ status: BUILD_PASSING, failingChecks: [] });
  });

  it('reports unknown when every context was set aside', () => {
    // CircleCI config with `ignore: main`: the only status on main's HEAD is a
    // red from a feature-branch build. Main may never have been built.
    expect(
      verdict(
        rollup([status('ci/circleci: build', 'FAILURE')]),
        builds({
          [CIRCLE_URL]: { branch: 'renovate/deps', outcome: 'failed' },
        }),
      ),
    ).toEqual({ status: BUILD_UNKNOWN, failingChecks: [] });
    expect(
      verdict(
        rollup([check('lint', 'FAILURE', 'gh-readonly-queue/main/pr-1')]),
        builds({}),
      ),
    ).toEqual({ status: BUILD_UNKNOWN, failingChecks: [] });
  });

  it('does not take an unrelated green check as evidence when CircleCI reports', () => {
    // `ignore: main` in the CircleCI config: CircleCI's only red is a
    // feature-branch build, set aside, and the green pre-commit workflow on
    // main says nothing about whether the build runs.
    expect(
      verdict(
        rollup([
          status('ci/circleci: build', 'FAILURE'),
          check('zz_generated.pre-commit', 'SUCCESS', MAIN),
        ]),
        builds({
          [CIRCLE_URL]: { branch: 'renovate/deps', outcome: 'failed' },
        }),
      ),
    ).toEqual({ status: BUILD_UNKNOWN, failingChecks: [] });
  });

  it('takes a green CircleCI check run on the default branch as evidence', () => {
    expect(
      verdict(
        rollup([
          check(
            'build',
            'SUCCESS',
            MAIN,
            'https://app.circleci.com/pipelines/github/giantswarm/my-app/9',
          ),
          check('zz_generated.pre-commit', 'SUCCESS', MAIN),
        ]),
        builds({}),
      ),
    ).toEqual({ status: BUILD_PASSING, failingChecks: [] });
  });

  it('still lets a non-build check fail the branch when CircleCI is green', () => {
    expect(
      verdict(
        rollup([CIRCLE_MAIN_GREEN, check('lint', 'FAILURE', MAIN)]),
        builds({}),
      ),
    ).toEqual({ status: BUILD_FAILING, failingChecks: ['lint'] });
  });

  it.each(['canceled', 'running', 'queued', 'not_run'])(
    'reports unknown, not passing, for a %s build on the default branch',
    outcome => {
      expect(
        verdict(
          rollup([
            status('ci/circleci: build', 'ERROR'),
            check('lint', 'SUCCESS', MAIN),
          ]),
          builds({ [CIRCLE_URL]: { branch: MAIN, outcome } }),
        ),
      ).toEqual({ status: BUILD_UNKNOWN, failingChecks: [] });
    },
  );

  it('sets aside a canceled build on another branch', () => {
    expect(
      verdict(
        rollup([status('ci/circleci: build', 'ERROR'), CIRCLE_MAIN_GREEN]),
        builds({
          [CIRCLE_URL]: { branch: 'renovate/deps', outcome: 'canceled' },
        }),
      ),
    ).toEqual({ status: BUILD_PASSING, failingChecks: [] });
  });

  it('sets aside a failing tag build on the same SHA', () => {
    // The release commit is main's HEAD and the tag pipeline failed. CircleCI
    // reports a tag build with no branch.
    expect(
      verdict(
        rollup([status('ci/circleci: release', 'FAILURE'), CIRCLE_MAIN_GREEN]),
        builds({
          [CIRCLE_URL]: { branch: null, tag: 'v1.2.3', outcome: 'failed' },
        }),
      ),
    ).toEqual({ status: BUILD_PASSING, failingChecks: [] });
  });

  it.each([null, 'CANCELLED', 'STALE', 'ACTION_REQUIRED'])(
    'reports unknown, not passing, for a %s check run on the default branch',
    conclusion => {
      expect(
        verdict(
          rollup([
            check('build', conclusion, MAIN),
            check('lint', 'SUCCESS', MAIN),
          ]),
          builds({}),
        ),
      ).toEqual({ status: BUILD_UNKNOWN, failingChecks: [] });
    },
  );

  it.each(['PENDING', 'EXPECTED'])(
    'reports unknown, not passing, for a %s status',
    state => {
      // Merged to main, the CircleCI build on HEAD has not finished.
      expect(
        verdict(
          rollup([
            status('ci/circleci: build', state),
            check('lint', 'SUCCESS', MAIN),
          ]),
          builds({ [CIRCLE_URL]: { branch: MAIN, outcome: 'running' } }),
        ),
      ).toEqual({ status: BUILD_UNKNOWN, failingChecks: [] });
    },
  );

  it('sets aside a pending status whose build runs on another branch', () => {
    expect(
      verdict(
        rollup([status('ci/circleci: build', 'PENDING'), CIRCLE_MAIN_GREEN]),
        builds({
          [CIRCLE_URL]: { branch: 'renovate/deps', outcome: 'running' },
        }),
      ),
    ).toEqual({ status: BUILD_PASSING, failingChecks: [] });
  });

  it('reports unknown, never passing, when a red cannot be resolved', () => {
    // No build behind the URL (private project, deleted build, 5xx) and a
    // status with no URL at all. Calling either green would assert a build
    // nobody verified.
    expect(
      verdict(
        rollup([status('ci/circleci: build', 'FAILURE')]),
        builds({ [CIRCLE_URL]: undefined }),
      ),
    ).toEqual({ status: BUILD_UNKNOWN, failingChecks: [] });
    expect(
      verdict(rollup([status('external', 'FAILURE', null)]), builds({})),
    ).toEqual({ status: BUILD_UNKNOWN, failingChecks: [] });
  });

  it('routes a failing check run with no suite branch through attribution', () => {
    // A tag-triggered run on the same SHA. Unproven unless CircleCI says
    // otherwise.
    expect(
      verdict(rollup([check('release', 'FAILURE', null)]), builds({})),
    ).toEqual({ status: BUILD_UNKNOWN, failingChecks: [] });
  });

  it('passes when everything is green', () => {
    expect(
      verdict(
        rollup([
          check('lint', 'SUCCESS', MAIN),
          check('skipped', 'SKIPPED', MAIN),
          check('neutral', 'NEUTRAL', MAIN),
          status('ci/circleci: build', 'SUCCESS'),
        ]),
        builds({}),
      ),
    ).toEqual({ status: BUILD_PASSING, failingChecks: [] });
  });

  it('does not take a skipped or neutral check as evidence', () => {
    // A path-filtered or `if:`-skipped job verified nothing.
    expect(
      verdict(
        rollup([check('docs', 'SKIPPED', MAIN), check('n', 'NEUTRAL', MAIN)]),
        builds({}),
      ),
    ).toEqual({ status: BUILD_UNKNOWN, failingChecks: [] });
  });

  it('does not take a build with no outcome as a verdict', () => {
    expect(
      verdict(
        rollup([
          status('ci/circleci: build', 'FAILURE'),
          check('lint', 'SUCCESS', MAIN),
        ]),
        builds({ [CIRCLE_URL]: { branch: MAIN, outcome: '' } }),
      ),
    ).toEqual({ status: BUILD_UNKNOWN, failingChecks: [] });
  });

  it('reports unknown when the contexts page is truncated', () => {
    // A failure past the page boundary would otherwise read as green.
    expect(
      verdict(rollup([check('lint', 'SUCCESS', MAIN)], 150), builds({})),
    ).toEqual({ status: BUILD_UNKNOWN, failingChecks: [] });
  });

  it('still reports failing on a truncated page when a failure is in view', () => {
    expect(
      verdict(rollup([check('lint', 'FAILURE', MAIN)], 150), builds({})),
    ).toEqual({ status: BUILD_FAILING, failingChecks: ['lint'] });
  });

  it('writes nothing when no CI reports to the branch at all', () => {
    expect(verdict(rollup([]), builds({}))).toBeUndefined();
  });

  it('names every confirmed failure, sorted', () => {
    expect(
      verdict(
        rollup([
          status('ci/circleci: test', 'FAILURE'),
          check('lint', 'TIMED_OUT', MAIN),
        ]),
        builds({ [CIRCLE_URL]: { branch: MAIN, outcome: 'failed' } }),
      ),
    ).toEqual({
      status: BUILD_FAILING,
      failingChecks: ['ci/circleci: test', 'lint'],
    });
  });

  it('names a check failing in two workflows once', () => {
    expect(
      verdict(
        rollup([
          check('build', 'FAILURE', MAIN),
          check('build', 'FAILURE', MAIN),
        ]),
        builds({}),
      ),
    ).toEqual({ status: BUILD_FAILING, failingChecks: ['build'] });
  });
});

describe('parseRollup', () => {
  it('reads check runs and statuses from the GraphQL shape', () => {
    const parsed = parseRollup({
      data: {
        repository: {
          defaultBranchRef: {
            name: 'main',
            target: {
              statusCheckRollup: {
                contexts: {
                  totalCount: 2,
                  nodes: [
                    {
                      __typename: 'CheckRun',
                      name: 'lint',
                      conclusion: 'FAILURE',
                      detailsUrl: 'https://github.com/x/y/actions/runs/1',
                      checkSuite: { branch: { name: 'main' } },
                    },
                    {
                      __typename: 'StatusContext',
                      context: 'ci/circleci: build',
                      state: 'FAILURE',
                      targetUrl: CIRCLE_URL,
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });

    expect(parsed).toEqual({
      defaultBranch: 'main',
      totalCount: 2,
      contexts: [
        check(
          'lint',
          'FAILURE',
          'main',
          'https://github.com/x/y/actions/runs/1',
        ),
        status('ci/circleci: build', 'FAILURE'),
      ],
    });
  });

  it('reads a null suite branch as unproven, not as the default branch', () => {
    const parsed = parseRollup({
      data: {
        repository: {
          defaultBranchRef: {
            name: 'main',
            target: {
              statusCheckRollup: {
                contexts: {
                  totalCount: 1,
                  nodes: [
                    {
                      __typename: 'CheckRun',
                      name: 'release',
                      conclusion: 'FAILURE',
                      checkSuite: { branch: null },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    });

    expect(parsed?.contexts).toEqual([check('release', 'FAILURE', null)]);
  });

  it('returns an empty rollup, not undefined, when no CI ever reported', () => {
    expect(
      parseRollup({
        data: {
          repository: {
            defaultBranchRef: {
              name: 'main',
              target: { statusCheckRollup: null },
            },
          },
        },
      }),
    ).toEqual({ defaultBranch: 'main', totalCount: 0, contexts: [] });
  });

  it('returns undefined for an empty repository', () => {
    expect(
      parseRollup({ data: { repository: { defaultBranchRef: null } } }),
    ).toBeUndefined();
  });
});

describe('BuildStatusProcessor', () => {
  const dummyLocation = { type: 'url', target: 'https://example.com' };
  const dummyEmit = jest.fn();
  const dummyCache = { get: jest.fn(), set: jest.fn() } as any;
  const credentialsProvider = {
    getCredentials: jest.fn().mockResolvedValue({ token: 'gh-token' }),
  } as any;
  const integrations = { github: { byUrl: () => undefined } } as any;

  function graphqlBody(
    nodes: Array<Record<string, unknown>>,
    totalCount?: number,
  ) {
    return {
      data: {
        repository: {
          defaultBranchRef: {
            name: 'main',
            target: {
              statusCheckRollup: {
                contexts: { totalCount: totalCount ?? nodes.length, nodes },
              },
            },
          },
        },
      },
    };
  }

  /**
   * A `fetch` stand-in answering GitHub GraphQL with the given body and
   * CircleCI v1.1 with the given builds by URL.
   */
  function fakeFetch(options: {
    graphql?: unknown;
    graphqlStatus?: number;
    circle?: Record<string, { branch: string; status: string }>;
    /** Overrides the HTTP status of every CircleCI answer. */
    circleStatus?: number;
  }) {
    const { graphql, graphqlStatus = 200, circle = {}, circleStatus } = options;
    return jest.fn(async (url: string) => {
      if (url === 'https://api.github.com/graphql') {
        return {
          ok: graphqlStatus === 200,
          status: graphqlStatus,
          statusText: 'stubbed',
          json: async () => graphql,
        };
      }
      const match = /project\/gh\/([^/]+)\/([^/]+)\/(\d+)$/.exec(url);
      const key = match
        ? `https://circleci.com/gh/${match[1]}/${match[2]}/${match[3]}`
        : '';
      const build = circle[key];
      const httpStatus = circleStatus ?? (build ? 200 : 404);
      return {
        ok: httpStatus === 200,
        status: httpStatus,
        statusText: 'stubbed',
        json: async () => build,
      };
    });
  }

  function makeProcessor(
    fetchImpl: jest.Mock,
    options: {
      logger?: ReturnType<typeof mockServices.logger.mock>;
      credentials?: typeof credentialsProvider;
    } = {},
  ) {
    return new BuildStatusProcessor({
      logger: options.logger ?? mockServices.logger.mock(),
      credentialsProvider: options.credentials ?? credentialsProvider,
      integrations,
      cacheTtlMs: 60_000,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
  }

  function component(
    annotations: Record<string, string> = {},
    labels: Record<string, string> = {},
  ): Entity {
    return {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Component',
      metadata: { name: 'my-app', namespace: 'default', annotations, labels },
      spec: { type: 'service', lifecycle: 'production', owner: 'team-x' },
    };
  }

  const slug = { 'github.com/project-slug': 'giantswarm/my-app' };

  async function run(processor: BuildStatusProcessor, entity: Entity) {
    return processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );
  }

  it('writes a failing verdict, the failing checks and BUILD-RED', async () => {
    const processor = makeProcessor(
      fakeFetch({
        graphql: graphqlBody([
          {
            __typename: 'StatusContext',
            context: 'ci/circleci: build',
            state: 'FAILURE',
            targetUrl: CIRCLE_URL,
          },
        ]),
        circle: { [CIRCLE_URL]: { branch: 'main', status: 'failed' } },
      }),
    );

    const result = await run(
      processor,
      component({
        ...slug,
        'giantswarm.io/readiness-flags': 'NO-VALUES-SCHEMA',
      }),
    );

    expect(result.metadata.labels?.['giantswarm.io/build-status']).toBe(
      BUILD_FAILING,
    );
    expect(
      result.metadata.annotations?.['giantswarm.io/build-failing-checks'],
    ).toBe('["ci/circleci: build"]');
    // RepoContentProcessor owns the default branch.
    expect(
      result.metadata.annotations?.['giantswarm.io/default-branch'],
    ).toBeUndefined();
    expect(
      result.metadata.annotations?.['giantswarm.io/build-status-checked'],
    ).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Merged, not overwritten: the importer's flag survives.
    expect(result.metadata.annotations?.['giantswarm.io/readiness-flags']).toBe(
      'BUILD-RED,NO-VALUES-SCHEMA',
    );
  });

  it('never touches the release verdict', async () => {
    const processor = makeProcessor(
      fakeFetch({
        graphql: graphqlBody([
          {
            __typename: 'CheckRun',
            name: 'lint',
            conclusion: 'FAILURE',
            checkSuite: { branch: { name: 'main' } },
          },
        ]),
      }),
    );

    const result = await run(
      processor,
      component(slug, { 'giantswarm.io/readiness': 'releasable' }),
    );

    expect(result.metadata.labels?.['giantswarm.io/readiness']).toBe(
      'releasable',
    );
    expect(result.metadata.labels?.['giantswarm.io/build-status']).toBe(
      BUILD_FAILING,
    );
  });

  it('writes passing without adding any flag', async () => {
    const processor = makeProcessor(
      fakeFetch({
        graphql: graphqlBody([
          {
            __typename: 'CheckRun',
            name: 'lint',
            conclusion: 'SUCCESS',
            checkSuite: { branch: { name: 'main' } },
          },
        ]),
      }),
    );

    const result = await run(processor, component(slug));

    expect(result.metadata.labels?.['giantswarm.io/build-status']).toBe(
      BUILD_PASSING,
    );
    expect(
      result.metadata.annotations?.['giantswarm.io/readiness-flags'],
    ).toBeUndefined();
    expect(
      result.metadata.annotations?.['giantswarm.io/build-failing-checks'],
    ).toBeUndefined();
  });

  it('leaves the entity alone when no CI reports to the branch', async () => {
    const processor = makeProcessor(fakeFetch({ graphql: graphqlBody([]) }));
    const entity = component(slug);

    const result = await run(processor, entity);

    expect(result).toEqual(entity);
  });

  it('reports unknown when GitHub cannot be asked', async () => {
    const processor = makeProcessor(
      fakeFetch({ graphql: undefined, graphqlStatus: 502 }),
    );

    const result = await run(processor, component(slug));

    expect(result.metadata.labels?.['giantswarm.io/build-status']).toBe(
      BUILD_UNKNOWN,
    );
    expect(
      result.metadata.annotations?.['giantswarm.io/readiness-flags'],
    ).toBeUndefined();
  });

  it('keeps commas inside a failing check name', async () => {
    const processor = makeProcessor(
      fakeFetch({
        graphql: graphqlBody([
          {
            __typename: 'CheckRun',
            name: 'test (ubuntu-latest, 20)',
            conclusion: 'FAILURE',
            checkSuite: { branch: { name: 'main' } },
          },
        ]),
      }),
    );

    const result = await run(processor, component(slug));

    expect(
      JSON.parse(
        result.metadata.annotations?.['giantswarm.io/build-failing-checks'] ??
          '',
      ),
    ).toEqual(['test (ubuntu-latest, 20)']);
  });

  it('leaves the entity alone, at debug, for a repository GitHub cannot find', async () => {
    const logger = mockServices.logger.mock();
    const fetchImpl = fakeFetch({
      graphql: {
        data: { repository: null },
        errors: [{ type: 'NOT_FOUND', message: 'Could not resolve' }],
      },
    });
    const processor = makeProcessor(fetchImpl, { logger });
    const entity = component(slug);

    expect(await run(processor, entity)).toEqual(entity);
    await run(processor, entity);

    expect(logger.warn).not.toHaveBeenCalled();
    // A stale slug is cached like any other answer, not asked every pass.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('leaves the entity alone, at debug, for a repository outside the app installation', async () => {
    const logger = mockServices.logger.mock();
    const processor = makeProcessor(
      fakeFetch({
        graphql: {
          data: { repository: null },
          errors: [
            {
              type: 'FORBIDDEN',
              message: 'Resource not accessible by integration',
            },
          ],
        },
      }),
      { logger },
    );
    const entity = component(slug);

    expect(await run(processor, entity)).toEqual(entity);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('leaves the entity alone and warns once per owner without a token', async () => {
    const logger = mockServices.logger.mock();
    const processor = makeProcessor(fakeFetch({}), {
      logger,
      credentials: {
        getCredentials: jest.fn().mockResolvedValue({ token: undefined }),
      } as any,
    });
    const entity = component(slug);
    const sibling = component({
      'github.com/project-slug': 'giantswarm/other',
    });

    expect(await run(processor, entity)).toEqual(entity);
    expect(await run(processor, sibling)).toEqual(sibling);

    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('does not cache a lookup CircleCI rate-limited', async () => {
    const fetchImpl = fakeFetch({
      graphql: graphqlBody([
        {
          __typename: 'StatusContext',
          context: 'ci/circleci: build',
          state: 'FAILURE',
          targetUrl: CIRCLE_URL,
        },
      ]),
      circleStatus: 429,
    });
    const processor = makeProcessor(fetchImpl);

    await run(processor, component(slug));
    await run(processor, component(slug));

    // GraphQL and CircleCI asked on both passes.
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('keeps the last known verdict when a later lookup fails', async () => {
    let graphqlStatus = 200;
    const passing = fakeFetch({
      graphql: graphqlBody([
        {
          __typename: 'CheckRun',
          name: 'lint',
          conclusion: 'SUCCESS',
          checkSuite: { branch: { name: 'main' } },
        },
      ]),
    });
    const fetchImpl = jest.fn(async (url: string) =>
      graphqlStatus === 200
        ? passing(url)
        : {
            ok: false,
            status: 502,
            statusText: 'stubbed',
            json: async () => ({}),
          },
    );
    const processor = new BuildStatusProcessor({
      logger: mockServices.logger.mock(),
      credentialsProvider,
      integrations,
      cacheTtlMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const first = await run(processor, component(slug));
    graphqlStatus = 502;
    const second = await run(processor, component(slug));

    // A GitHub 5xx says nothing about the build: no fleet-wide flip to
    // unknown, and the original checkedAt shows how old the verdict is.
    expect(second.metadata.labels?.['giantswarm.io/build-status']).toBe(
      BUILD_PASSING,
    );
    expect(
      second.metadata.annotations?.['giantswarm.io/build-status-checked'],
    ).toBe(first.metadata.annotations?.['giantswarm.io/build-status-checked']);
  });

  it('stops serving the last known verdict after a day', async () => {
    let graphqlStatus = 200;
    const passing = fakeFetch({
      graphql: graphqlBody([
        {
          __typename: 'CheckRun',
          name: 'lint',
          conclusion: 'SUCCESS',
          checkSuite: { branch: { name: 'main' } },
        },
      ]),
    });
    const fetchImpl = jest.fn(async (url: string) =>
      graphqlStatus === 200
        ? passing(url)
        : {
            ok: false,
            status: 401,
            statusText: 'stubbed',
            json: async () => ({}),
          },
    );
    const processor = new BuildStatusProcessor({
      logger: mockServices.logger.mock(),
      credentialsProvider,
      integrations,
      cacheTtlMs: 0,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const now = jest.spyOn(Date, 'now');
    try {
      now.mockReturnValue(0);
      const first = await run(processor, component(slug));
      expect(first.metadata.labels?.['giantswarm.io/build-status']).toBe(
        BUILD_PASSING,
      );
      graphqlStatus = 401;
      now.mockReturnValue(25 * 60 * 60 * 1000);
      const later = await run(processor, component(slug));

      expect(later.metadata.labels?.['giantswarm.io/build-status']).toBe(
        BUILD_UNKNOWN,
      );
    } finally {
      now.mockRestore();
    }
  });

  it('skips entities that are not components or have no slug', async () => {
    const fetchImpl = fakeFetch({ graphql: graphqlBody([]) });
    const processor = makeProcessor(fetchImpl);

    const noSlug = component();
    expect(await run(processor, noSlug)).toEqual(noSlug);
    const api: Entity = { ...component(slug), kind: 'API' };
    expect(await run(processor, api)).toEqual(api);
    // A pasted URL path is not a slug.
    const badSlug = component({
      'github.com/project-slug': 'giantswarm/my-app/tree/main',
    });
    expect(await run(processor, badSlug)).toEqual(badSlug);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('asks GitHub once per repo within the TTL', async () => {
    const fetchImpl = fakeFetch({ graphql: graphqlBody([]) });
    const processor = makeProcessor(fetchImpl);

    await run(processor, component(slug));
    await run(processor, component(slug));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
