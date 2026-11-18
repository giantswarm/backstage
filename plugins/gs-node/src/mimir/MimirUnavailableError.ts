import { MimirUnavailableReason } from '@giantswarm/backstage-plugin-gs-common';
import { ReportedServiceUnavailableError } from '../errors';

/**
 * The 503 {@link MimirService} throws when an installation's Mimir could not
 * answer a query: it did not answer at all, or answered something other than
 * a success or a refused token.
 *
 * The service has already logged the failure as a warning with a fixed
 * message, the installation, the HTTP status and Mimir's own error in the
 * metadata, so `reportedErrorHandler()` answers it without the error
 * middleware reporting it again. Its message is for the person and names the
 * installation; Mimir's text (a block ID, a pod address) stays out of it and
 * of the answer, in `mimirError`.
 */
export class MimirUnavailableError extends ReportedServiceUnavailableError {
  /** Why, when the frontend has words for it; see `MIMIR_UNAVAILABLE_REASONS`. */
  readonly reason?: MimirUnavailableReason;
  /**
   * Mimir's own error text, or the connection's, for whoever debugs it.
   * Not enumerable, so the 503 body (`serializeError`) leaves it out: a block
   * ID or a pod address is no use in the browser. The warning carries it.
   */
  declare readonly mimirError?: string;

  constructor(
    message: string,
    options: { reason?: MimirUnavailableReason; mimirError?: string } = {},
  ) {
    super(message);
    if (options.reason) {
      this.reason = options.reason;
    }
    if (options.mimirError) {
      Object.defineProperty(this, 'mimirError', {
        value: options.mimirError,
        enumerable: false,
      });
    }
  }
}

/**
 * Mimir's answers that mean it has no healthy store-gateway, so it cannot
 * read the blocks in long-term storage, while the ingesters still serve recent
 * data:
 *
 * - `failed to get store-gateway replication set owning the block <id>: at
 *   least 1 healthy replica required, could only find 0 ...` -- the querier
 *   found no store-gateway for a block.
 * - `no store-gateway instance left after checking exclude for block <id>` --
 *   every store-gateway that holds the block failed already.
 * - `consistency check failed because some blocks were not queried: <ids>` --
 *   the querier gave up on blocks no store-gateway returned.
 */
const STORE_GATEWAY_FAILURES = [
  /failed to get store-gateway replication set/i,
  /no store-gateway instance left/i,
  /consistency check failed because some blocks were not queried/i,
];

/** Why Mimir failed, when its error text says something a person can use. */
export function mimirUnavailableReason(
  mimirError: string,
): MimirUnavailableReason | undefined {
  return STORE_GATEWAY_FAILURES.some(pattern => pattern.test(mimirError))
    ? 'older_data_unavailable'
    : undefined;
}

/** How much of Mimir's error text the log and the answer keep. */
const MAX_MIMIR_ERROR_LENGTH = 1000;

/**
 * The error text of a Mimir answer: the `error` field of Prometheus' JSON
 * error body (`{"status":"error","errorType":...,"error":...}`), or the body
 * itself when it is something else (a gateway's HTML page, plain text),
 * shortened.
 */
export function mimirErrorText(body: string): string {
  let text = body;
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.error === 'string') {
      text = parsed.error;
    }
  } catch {
    // Not JSON: keep the body.
  }
  return text.length > MAX_MIMIR_ERROR_LENGTH
    ? `${text.slice(0, MAX_MIMIR_ERROR_LENGTH)}…`
    : text;
}
