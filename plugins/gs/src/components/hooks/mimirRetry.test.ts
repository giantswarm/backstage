import { mimirQueryRetry } from './mimirRetry';

describe('mimirQueryRetry', () => {
  const timeout = new Error('Mimir request timed out after 30000ms');

  it('retries a failed query once', () => {
    expect(mimirQueryRetry(0, timeout)).toBe(true);
    expect(mimirQueryRetry(1, timeout)).toBe(false);
  });

  it.each(['UnauthorizedError', 'ForbiddenError', 'NotFoundError'])(
    'never retries a %s',
    name => {
      const error = new Error('no');
      error.name = name;
      expect(mimirQueryRetry(0, error)).toBe(false);
    },
  );
});
