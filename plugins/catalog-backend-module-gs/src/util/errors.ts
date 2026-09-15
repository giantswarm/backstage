/**
 * Error classes whose failures clear up on their own: the caller retries on its
 * next run, so a human has nothing to act on.
 */
const TRANSIENT_ERROR_NAMES = new Set([
  'AbortError',
  'FetchError',
  'ServiceUnavailableError',
  'TimeoutError',
]);

const TRANSIENT_MESSAGE_PATTERNS = [
  /\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN)\b/,
  /socket hang up/i,
  /request time(?:d)? ?out/i,
  /Invalid response body/i,
  // `${status} ${statusText}` of a failed upstream HTTP response: rate limits
  // and gateway/backend failures.
  /\b(?:429|500|502|503|504)\s+[A-Z]/,
];

type ErrorInfo = {
  name: string | undefined;
  message: string;
};

/**
 * Reads the name and message off a thrown value.
 *
 * Errors do not survive `JSON.stringify`, so one that reached this instance
 * over the events bus rather than from its own process arrives as a plain
 * object — or as an empty one.
 */
export function readErrorInfo(error: unknown): ErrorInfo {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  if (error && typeof error === 'object') {
    const { name, message } = error as { name?: unknown; message?: unknown };
    return {
      name: typeof name === 'string' ? name : undefined,
      message: typeof message === 'string' ? message : '',
    };
  }
  return { name: undefined, message: String(error) };
}

/**
 * Whether a failure is a transient upstream blip rather than something that
 * needs attention.
 *
 * Logging these at `warn` sends them to Sentry, where they pile up as one issue
 * per affected chart, entity or URL for a registry or API that was briefly
 * unreachable and recovered by itself.
 */
export function isTransientError(error: unknown): boolean {
  const { name, message } = readErrorInfo(error);
  if (name && TRANSIENT_ERROR_NAMES.has(name)) {
    return true;
  }
  return TRANSIENT_MESSAGE_PATTERNS.some(pattern => pattern.test(message));
}
