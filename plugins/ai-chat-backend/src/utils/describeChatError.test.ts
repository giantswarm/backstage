import { APICallError, RetryError, StreamProviderError } from 'ai';
import { describeChatError } from './describeChatError';

function apiCallError(message: string, statusCode: number): APICallError {
  return new APICallError({
    message,
    url: 'https://api.anthropic.com/v1/messages',
    requestBodyValues: {},
    statusCode,
  });
}

describe('describeChatError', () => {
  it('reports an overloaded provider after the retries ran out', () => {
    const overloaded = apiCallError('Overloaded', 529);
    const error = new RetryError({
      message: 'Failed after 3 attempts. Last error: Overloaded',
      reason: 'maxRetriesExceeded',
      errors: [overloaded, overloaded, overloaded],
    });

    expect(describeChatError(error)).toBe(
      'The model provider reports an error: Overloaded. The request was already tried 3 times. Please try again in a moment.',
    );
  });

  it('reports a provider error that is not worth retrying at once', () => {
    const error = apiCallError('Invalid API key.', 401);

    expect(describeChatError(error)).toBe(
      'The model provider reports an error: Invalid API key. Please try again.',
    );
  });

  it('reports an error the provider sent mid-stream', () => {
    const error = new StreamProviderError({
      message: 'Overloaded',
      type: 'overloaded_error',
      isRetryable: true,
    });

    expect(describeChatError(error)).toBe(
      'The model provider reports an error: Overloaded. Please try again in a moment.',
    );
  });

  it('leaves out a provider message that is a raw response body', () => {
    const error = apiCallError(`{\n  "error": "${'x'.repeat(300)}"\n}`, 500);

    expect(describeChatError(error)).toBe(
      'The model provider reports an error. Please try again in a moment.',
    );
  });

  it('never exposes internal error text', () => {
    expect(
      describeChatError(new Error('ECONNREFUSED 10.0.0.12:5432 (postgres)')),
    ).toBe(
      'Something went wrong while generating the reply. Please try again.',
    );
  });
});
