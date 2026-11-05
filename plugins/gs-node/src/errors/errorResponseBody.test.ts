import { NotFoundError } from '@backstage/errors';
import { errorResponseBody } from './errorResponseBody';

describe('errorResponseBody', () => {
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("builds the error middleware's body, with the full URL", () => {
    expect(
      errorResponseBody(
        new NotFoundError('nope'),
        {
          method: 'GET',
          url: '/thing',
          originalUrl: '/api/plugin/thing',
        },
        404,
      ),
    ).toEqual({
      error: { name: 'NotFoundError', message: 'nope' },
      request: { method: 'GET', url: '/api/plugin/thing' },
      response: { statusCode: 404 },
    });
  });

  it('falls back to `url` outside a mounted router', () => {
    expect(
      errorResponseBody(new Error('x'), { method: 'POST', url: '/x' }, 500)
        .request,
    ).toEqual({ method: 'POST', url: '/x' });
  });

  it('includes the stack only in development', () => {
    const error = new Error('x');
    process.env.NODE_ENV = 'production';
    expect(
      errorResponseBody(error, { method: 'GET', url: '/' }, 500).error,
    ).not.toHaveProperty('stack');
    process.env.NODE_ENV = 'development';
    expect(
      errorResponseBody(error, { method: 'GET', url: '/' }, 500).error,
    ).toHaveProperty('stack');
  });
});
