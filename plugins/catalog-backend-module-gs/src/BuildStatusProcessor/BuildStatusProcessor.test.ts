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
        rollup([check('lint', 'FAILURE', 'gh-readonly-queue/main/pr-1')]),
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
        rollup([status('ci/circleci: build', 'FAILURE')]),
        builds({
          [CIRCLE_URL]: { branch: 'renovate/deps', outcome: 'failed' },
        }),
      ),
    ).toEqual({ status: BUILD_PASSING, failingChecks: [] });
  });

  it('treats a canceled build as superseded, not as a failure', () => {
    expect(
      verdict(
        rollup([status('ci/circleci: build', 'ERROR')]),
        builds({ [CIRCLE_URL]: { branch: MAIN, outcome: 'canceled' } }),
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
          status('ci/circleci: build', 'SUCCESS'),
          status('pending', 'PENDING'),
        ]),
        builds({}),
      ),
    ).toEqual({ status: BUILD_PASSING, failingChecks: [] });
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
  }) {
    const { graphql, graphqlStatus = 200, circle = {} } = options;
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
      return {
        ok: Boolean(build),
        status: build ? 200 : 404,
        statusText: 'stubbed',
        json: async () => build,
      };
    });
  }

  function makeProcessor(fetchImpl: jest.Mock) {
    return new BuildStatusProcessor({
      logger: mockServices.logger.mock(),
      credentialsProvider,
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
    ).toBe('ci/circleci: build');
    expect(result.metadata.annotations?.['giantswarm.io/default-branch']).toBe(
      'main',
    );
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
