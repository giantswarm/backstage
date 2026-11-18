import {
  isTerminalMimirError,
  mimirPollingOptions,
  mimirQueryRetry,
} from './mimirRetry';

describe('mimirQueryRetry', () => {
  const timeout = new Error('Mimir request timed out after 30000ms');

  it('retries a failed query once', () => {
    expect(mimirQueryRetry(0, timeout)).toBe(true);
    expect(mimirQueryRetry(1, timeout)).toBe(false);
  });

  it.each([
    'InputError',
    'UnauthorizedError',
    'ForbiddenError',
    'NotFoundError',
  ])('never retries a %s', name => {
    const error = new Error('no');
    error.name = name;
    expect(mimirQueryRetry(0, error)).toBe(false);
  });
});

describe('mimirPollingOptions', () => {
  const errored = (name: string) => {
    const error = new Error('no');
    error.name = name;
    return { state: { status: 'error', error } };
  };

  it('is nothing where the query does not poll', () => {
    expect(mimirPollingOptions(undefined)).toEqual({});
    expect(mimirPollingOptions(false)).toEqual({});
  });

  it('polls only from a visible tab, and stops on what the retry policy gives up on', () => {
    const options = mimirPollingOptions(30_000);

    expect(options.refetchIntervalInBackground).toBe(false);
    expect(options.refetchInterval?.(errored('Error'))).toBe(30_000);
    for (const name of [
      'InputError',
      'UnauthorizedError',
      'ForbiddenError',
      'NotFoundError',
    ]) {
      expect(options.refetchInterval?.(errored(name))).toBe(false);
      expect(isTerminalMimirError(errored(name).state.error)).toBe(true);
    }
  });
});
