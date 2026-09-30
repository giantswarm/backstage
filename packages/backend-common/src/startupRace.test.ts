import { isStartupPollFailure, STARTUP_REQUEST_FAILURE } from './startupRace';

// The events the Sentry transport builds for the two upstream log lines, as
// winston-sentry-log hands them to `beforeSend`.
function pollFailure(cause: unknown) {
  return {
    message:
      'Poll failed for subscription "catalog.catalog", retrying in 1000ms Request failed with 503 Service Unavailable',
    extra: {
      plugin: 'catalog',
      name: 'ResponseError',
      statusCode: 503,
      statusText: 'Service Unavailable',
      cause,
    },
  };
}

describe('isStartupPollFailure', () => {
  it('matches a poll failure caused by the backend starting up', () => {
    expect(
      isStartupPollFailure(
        pollFailure({
          name: 'ServiceUnavailableError',
          message: 'Service has not started up yet',
          stack: '[undefined]',
        }),
      ),
    ).toBe(true);
  });

  it.each([
    [
      'another 503',
      { name: 'ServiceUnavailableError', message: 'upstream overloaded' },
    ],
    [
      'the backend shutting down',
      { name: 'ServiceUnavailableError', message: 'Service is shutting down' },
    ],
    [
      'another error with the same message',
      { name: 'Error', message: 'Service has not started up yet' },
    ],
    ['no cause', undefined],
    ['a string cause', 'Service has not started up yet'],
  ])('keeps a poll failure caused by %s', (_, cause) => {
    expect(isStartupPollFailure(pollFailure(cause))).toBe(false);
  });

  it('keeps any other event with the same cause', () => {
    expect(
      isStartupPollFailure({
        message: 'Subscriber "x" failed to process event for topic "y"',
        extra: {
          cause: {
            name: 'ServiceUnavailableError',
            message: 'Service has not started up yet',
          },
        },
      }),
    ).toBe(false);
  });
});

describe('STARTUP_REQUEST_FAILURE', () => {
  it("matches the errorHandler's line for the lifecycle middleware's 503", () => {
    expect(
      STARTUP_REQUEST_FAILURE.test(
        'Request failed with status 503 Service has not started up yet',
      ),
    ).toBe(true);
  });

  it.each([
    'Request failed with status 503 Service is shutting down',
    'Request failed with status 503 upstream overloaded',
    'Request failed with status 500 Service has not started up yet',
  ])('does not match %s', message => {
    expect(STARTUP_REQUEST_FAILURE.test(message)).toBe(false);
  });
});
