import { ConfigReader } from '@backstage/config';
import type { SentryEvent } from './normalizeSentryEvent';
import { getSentryTransportConfig } from './rootLogger';

// For tests: the options the Sentry transport gets, and what Sentry does with
// an event under them.

export const sentryOptions = getSentryTransportConfig(
  new ConfigReader({
    backend: {
      errorReporter: {
        sentry: {
          dsn: 'https://key@sentry.example.com/1',
          environment: 'test',
          tracesSampleRate: 0,
        },
      },
    },
  }),
)!;

/** Whether `ignoreErrors` drops a message. */
export function isIgnored(message: string): boolean {
  return sentryOptions.ignoreErrors.some(pattern => pattern.test(message));
}

/**
 * The event as Sentry sends it, or `null` when it is dropped: `ignoreErrors`
 * against the message, or the exception's value for an error-level log, then
 * `beforeSend`.
 */
export function sendToSentry(event: SentryEvent): SentryEvent | null {
  const message =
    typeof event.message === 'string'
      ? event.message
      : (event.exception?.values?.[0]?.value ?? '');
  if (isIgnored(message)) {
    return null;
  }
  return sentryOptions.beforeSend(event);
}
