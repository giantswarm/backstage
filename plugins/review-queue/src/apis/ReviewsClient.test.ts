import type { MusterApi } from '@giantswarm/backstage-plugin-muster';

import { GithubNotConnectedError, GithubRateLimitError } from '../lib/github';
import { createLimiter } from '../lib/limiter';
import { ReviewsClient } from './ReviewsClient';

type Call = {
  name: string;
  args: Record<string, unknown>;
  installation?: string;
};

function musterWith(answer: (call: Call) => unknown): {
  musterApi: MusterApi;
  calls: Call[];
} {
  const calls: Call[] = [];
  const musterApi = {
    callTool: jest.fn(
      async (
        name: string,
        args: Record<string, unknown>,
        installation?: string,
      ) => {
        const call = { name, args, installation };
        calls.push(call);
        return answer(call);
      },
    ),
  } as unknown as MusterApi;
  return { musterApi, calls };
}

const REF = { owner: 'giantswarm', repo: 'dex-app', number: 640 };

describe('ReviewsClient', () => {
  it('searches one page, oldest first, on the installation it was made for', async () => {
    const { musterApi, calls } = musterWith(() => ({
      total_count: 0,
      items: [],
    }));
    await new ReviewsClient(musterApi, 'gazelle').search('is:open author:@me');
    expect(calls).toEqual([
      {
        name: 'x_github_search_pull_requests',
        installation: 'gazelle',
        args: expect.objectContaining({
          query: 'is:open author:@me',
          perPage: 100,
          sort: 'created',
          order: 'asc',
        }),
      },
    ]);
    expect(calls[0].args.fields).not.toContain('body');
  });

  it('parses an answer that came as JSON text', async () => {
    const { musterApi } = musterWith(() =>
      JSON.stringify({ total_count: 3, items: [] }),
    );
    await expect(
      new ReviewsClient(musterApi, 'gazelle').search('q'),
    ).resolves.toEqual({ total_count: 3, items: [] });
  });

  it('classifies a tool error that came as text', async () => {
    const { musterApi } = musterWith(
      () => 'failed to search: 403 API rate limit exceeded [rate reset in 30s]',
    );
    await expect(
      new ReviewsClient(musterApi, 'gazelle').search('q'),
    ).rejects.toBeInstanceOf(GithubRateLimitError);
  });

  it("classifies muster's refusal", async () => {
    const { musterApi } = musterWith(() => {
      throw new Error("auth_required: server 'github' requires authentication");
    });
    await expect(
      new ReviewsClient(musterApi, 'gazelle').search('q'),
    ).rejects.toBeInstanceOf(GithubNotConnectedError);
  });

  it("reads a PR's CI, review and merge state in four reads", async () => {
    const { musterApi, calls } = musterWith(({ args }) => {
      switch (args.method) {
        case 'get':
          return { number: 640, mergeable_state: 'dirty' };
        case 'get_check_runs':
          return {
            check_runs: [
              {
                id: 1,
                name: 'lint',
                status: 'completed',
                conclusion: 'success',
              },
            ],
          };
        case 'get_status':
          return {
            statuses: [{ context: 'ci/circleci: build', state: 'failure' }],
          };
        default:
          return [
            {
              id: 1,
              state: 'APPROVED',
              user: { login: 'a' },
              submitted_at: '2026-01-01T00:00:00Z',
            },
          ];
      }
    });
    const state = await new ReviewsClient(musterApi, 'gazelle').prState(REF);
    expect(calls.map(call => call.args.method).sort()).toEqual([
      'get',
      'get_check_runs',
      'get_reviews',
      'get_status',
    ]);
    expect(calls[0].args).toMatchObject({
      owner: 'giantswarm',
      repo: 'dex-app',
      pullNumber: 640,
    });
    expect(state).toEqual({
      ci: {
        state: 'failing',
        failing: ['ci/circleci: build'],
        running: 0,
        total: 2,
      },
      review: { state: 'approved', approvals: 1, changesBy: [] },
      merge: { state: 'conflicts', raw: 'dirty' },
    });
  });

  it('reads a mergeable state GitHub was still computing once more', async () => {
    let gets = 0;
    const { musterApi } = musterWith(({ args }) => {
      if (args.method === 'get') {
        gets++;
        return {
          number: 640,
          mergeable_state: gets === 1 ? 'unknown' : 'clean',
        };
      }
      return args.method === 'get_reviews' ? [] : {};
    });
    const state = await new ReviewsClient(musterApi, 'gazelle', {
      mergeableRetryMs: 0,
    }).prState(REF);
    expect(gets).toBe(2);
    expect(state.merge.state).toBe('ready');
  });

  it('reads at most the given number of PR states at once', async () => {
    let active = 0;
    let peak = 0;
    const { musterApi } = musterWith(async ({ args }) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 1));
      active--;
      if (args.method === 'get') {
        return { mergeable_state: 'clean' };
      }
      return args.method === 'get_reviews' ? [] : {};
    });
    const client = new ReviewsClient(musterApi, 'gazelle', { concurrency: 3 });
    await Promise.all(
      [1, 2, 3, 4, 5].map(number => client.prState({ ...REF, number })),
    );
    expect(peak).toBe(3);
  });
});

describe('ReviewsClient and a cancelled read', () => {
  it('does not send the reads of a query cancelled while they waited', async () => {
    const { musterApi, calls } = musterWith(({ args }) =>
      args.method === 'get_reviews' ? [] : { mergeable_state: 'clean' },
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      new ReviewsClient(musterApi, 'gazelle').prState(REF, controller.signal),
    ).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});

describe('createLimiter', () => {
  it('runs the next task when one ends, failed or not', async () => {
    const limit = createLimiter(1);
    const order: string[] = [];
    const failing = limit(async () => {
      order.push('a');
      throw new Error('a failed');
    });
    const next = limit(async () => {
      order.push('b');
      return 'b';
    });
    await expect(failing).rejects.toThrow('a failed');
    await expect(next).resolves.toBe('b');
    expect(order).toEqual(['a', 'b']);
  });
});

describe("ReviewsClient and muster's 401", () => {
  it('asks for the sign-in when muster refuses the call', async () => {
    const { MusterUnauthorizedError } = jest.requireActual(
      '@giantswarm/backstage-plugin-muster',
    );
    const { musterApi } = musterWith(() => {
      throw new MusterUnauthorizedError(
        'Sign in to github to use its tools.',
        'server_sign_in_required',
        'github',
        'gazelle',
      );
    });
    await expect(
      new ReviewsClient(musterApi, 'gazelle').search('q'),
    ).rejects.toBeInstanceOf(GithubNotConnectedError);
  });
});
