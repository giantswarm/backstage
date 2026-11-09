import { withPollingRule } from './pollingOptions';

describe('withPollingRule', () => {
  it('leaves a query that does not poll as it is', () => {
    expect(withPollingRule({ staleTime: 5 })).toEqual({ staleTime: 5 });
    expect(withPollingRule({ refetchInterval: false })).toEqual({
      refetchInterval: false,
    });
  });

  it('polls only from a visible tab, keeps the client’s focus setting, and stops on a 401 or 403 but not a 404', () => {
    const options = withPollingRule({ refetchInterval: 10_000 });
    const errored = (name: string) =>
      ({
        state: { status: 'error', error: Object.assign(new Error(), { name }) },
      }) as never;

    expect(options.refetchIntervalInBackground).toBe(false);
    // The Kubernetes clients keep focus refetches off with `staleTime` 0.
    expect(options).not.toHaveProperty('refetchOnWindowFocus');
    const interval = options.refetchInterval as (query: never) => unknown;
    expect(interval(errored('ForbiddenError'))).toBe(false);
    expect(interval(errored('UnauthorizedError'))).toBe(false);
    expect(interval(errored('NotFoundError'))).toBe(10_000);
  });
});
