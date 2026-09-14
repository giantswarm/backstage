import { LoggerService } from '@backstage/backend-plugin-api';
import {
  AuthenticationError,
  ConflictError,
  InputError,
  NotAllowedError,
  NotFoundError,
} from '@backstage/errors';
import { Code, ConnectError } from '@connectrpc/connect';
import { errorCode } from '@giantswarm/backstage-plugin-gs-node';

/**
 * kagent answered (or was reachable) and then failed: an `Internal`, an
 * `Unknown`, a timeout, a stream that could not be read.
 *
 * Deliberately **not** the same error as "kagent is absent". That case is a 404
 * (see {@link transportFailure}): silenced by the frontend, and below the
 * `>= 500` threshold at which `MiddlewareFactory.error()` logs to Sentry, which
 * matters because it is the expected outcome on most installations.
 *
 * This one surfaces as a 500, so the frontend reports it *and* it reaches Sentry —
 * both correct here. A deployed-but-degraded kagent is rare and genuinely
 * actionable, and its sessions silently vanishing from the fleet-merged list would
 * be the worse failure.
 */
export function upstreamError(message: string): Error {
  const error = new Error(message);
  error.name = 'UpstreamError';
  return error;
}

export function isUpstreamError(error: unknown): boolean {
  return (error as Error | undefined)?.name === 'UpstreamError';
}

/** Name of the error thrown when an A2A turn outlives its timeout. */
export const TURN_PENDING_ERROR_NAME = 'KagentTurnPendingError';

/**
 * The turn was dispatched and is still running.
 *
 * Deliberately not an upstream failure. `SendMessage` answers only once the
 * agent finishes, so losing that connection — to our own timeout, or to a
 * gateway's — says "nobody waited long enough", not "broken". The turn is
 * already recorded against the instance, which is what the client confirms
 * before reporting this, and the conversation poll will show it finish.
 *
 * The router turns this into a 202 rather than a 5xx, which
 * `MiddlewareFactory.error()` would forward to Sentry: one issue per long turn,
 * for the thing an agent is supposed to do.
 */
export function turnPendingError(message: string): Error {
  const error = new Error(message);
  error.name = TURN_PENDING_ERROR_NAME;
  return error;
}

export function isTurnPendingError(error: unknown): boolean {
  return (error as Error | undefined)?.name === TURN_PENDING_ERROR_NAME;
}

/**
 * Marks a `NotFoundError` that came from the **transport** rather than from
 * kagent.
 *
 * An unreachable host is reported as a 404 deliberately: on a fleet where most
 * installations run no kagent, that is the normal outcome and must stay off the
 * 5xx path. But the same branch also catches a socket that died *mid-request*,
 * which for a send is a lost connection, not an absent kagent.
 *
 * Carried as a property rather than a distinct error name because the name is
 * load-bearing: the frontend keys "no kagent here, stay silent" off `NotFoundError`,
 * and renaming it would make every kagent-less installation noisy.
 */
const TRANSPORT_FAILURE = Symbol.for('kagent.transportFailure');

export function transportFailure(message: string): Error {
  const error = new NotFoundError(message);
  (error as unknown as Record<symbol, boolean>)[TRANSPORT_FAILURE] = true;
  return error;
}

export function isTransportFailure(error: unknown): boolean {
  return Boolean(
    (error as unknown as Record<symbol, boolean> | undefined)?.[
      TRANSPORT_FAILURE
    ],
  );
}

/**
 * Node error codes that mean nobody answered at the socket level: no such
 * host, nothing listening, a TLS refusal. connect-node reports these under
 * `Unavailable` as well as a gateway's 502/503, and only the socket-level ones
 * mean "kagent is not deployed here".
 */
const SOCKET_FAILURE_CODES =
  /^(ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|EAI_FAIL|EAI_NONAME|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|EPROTO|ERR_TLS_|ERR_SSL_|ERR_OSSL_|ERR_HTTP2_)/;

/**
 * Whether a Connect failure is the network saying nobody is there. The cause
 * chain carries the socket error; the message is not consulted, because it
 * embeds the hostname.
 */
export function isSocketFailure(error: ConnectError): boolean {
  const code = errorCode(error.cause ?? error);
  return Boolean(
    code && (SOCKET_FAILURE_CODES.test(code) || /CERT|SELF_SIGNED/.test(code)),
  );
}

/** How one RPC's failures read to the user. */
export interface ErrorContext {
  /** What `NotFound` means when **kagent** answered it: the resource is gone. */
  missingResource: string;
  /** Short name of the RPC, used when kagent does not implement it. */
  endpoint: string;
  /**
   * Report a timeout as {@link turnPendingError}, for a call whose work
   * continues after we stop waiting.
   */
  timeoutIsPending?: boolean;
  /** What a rejected request means for this call; the generic upstream failure otherwise. */
  invalidArgument?: (reason: string) => Error;
  /**
   * What an `Unimplemented`/`Unknown` failure carrying an A2A *unsupported
   * operation* means for this call. The A2A gateway reports "the instance
   * already has an active task" that way; only the send paths care.
   */
  unsupportedOperation?: (reason: string) => Error;
}

/**
 * Map a Connect failure onto the error the caller should see.
 *
 * - `Unauthenticated` / `PermissionDenied` are kagent's (or the gateway's)
 *   decisions about the forwarded identity: 401 / 403.
 * - `NotFound` is kagent saying the resource is gone (or somebody else's): 404
 *   with the endpoint's own wording. `Unimplemented` is a controller that
 *   predates the RPC — unless the message names an A2A unsupported operation,
 *   which a2a-go reports under that code.
 * - `InvalidArgument` is a rejected request; each caller says what that means.
 * - `AlreadyExists` / `FailedPrecondition` / `Aborted` are conflicts.
 * - `DeadlineExceeded` / `Canceled` is our own timeout: a pending turn for a
 *   send, an upstream failure otherwise (kagent is deployed and unwell, not
 *   absent).
 * - A socket-level cause (nothing listening, no such host, a TLS refusal),
 *   whatever code it arrived under, is "kagent is not deployed here" — a 404
 *   the frontend silences, marked transport-borne so a send verifies rather
 *   than reports. `Unavailable` without one is a gateway or kagent answering
 *   5xx, an upstream failure.
 * - Everything else (`Internal`, `Unknown`, …) is an upstream failure.
 */
export function mapConnectError(
  error: unknown,
  context: ErrorContext,
  installationName: string,
  logger: LoggerService,
  turnTimeoutMs: number,
): Error {
  // A Backstage error thrown by our own code inside an RPC callback (a
  // validation failure while building a reply) must pass through untouched.
  if (error instanceof InputError || error instanceof ConflictError) {
    return error;
  }
  const connectError = ConnectError.from(error);
  const reason = connectError.rawMessage || connectError.message;

  // Checked before the code: connect-node reports a socket-level failure as
  // `Unavailable` in the normal case but as `Internal` where the Node error
  // arrives from another realm (a test sandbox); the cause chain's error code
  // is the reliable tell. DNS failure, TLS error or connection refused: nothing
  // is reachable at that host, i.e. kagent is not deployed on this
  // installation. On a fleet where only a couple of installations run kagent,
  // this is the normal, expected outcome for most of them on every page view,
  // so it is a 404 and not a 5xx `MiddlewareFactory.error()` would forward to
  // Sentry once per installation per page view.
  if (isSocketFailure(connectError)) {
    logger.debug(
      `kagent is not reachable for installation '${installationName}'`,
      { code: errorCode(connectError.cause ?? connectError) },
    );
    return transportFailure(
      `The kagent API is not available for installation '${installationName}'.`,
    );
  }

  switch (connectError.code) {
    case Code.Unauthenticated:
      return new AuthenticationError(
        `Not authenticated against the kagent API for installation '${installationName}'.`,
      );
    case Code.PermissionDenied:
      return new NotAllowedError(
        `Not authorized to use the kagent API for installation '${installationName}'.`,
      );
    case Code.NotFound:
      return new NotFoundError(context.missingResource);
    case Code.Unimplemented:
      if (context.unsupportedOperation && isUnsupportedOperation(reason)) {
        return context.unsupportedOperation(reason);
      }
      return new NotFoundError(
        `The kagent API for installation '${installationName}' has no ${context.endpoint} endpoint; it is probably running a version that predates it.`,
      );
    case Code.InvalidArgument:
      return context.invalidArgument
        ? context.invalidArgument(reason)
        : upstreamError(
            `The kagent API for installation '${installationName}' rejected the request: ${reason}`,
          );
    case Code.AlreadyExists:
    case Code.FailedPrecondition:
    case Code.Aborted:
      return new ConflictError(
        `The kagent API for installation '${installationName}' reported a conflict: ${reason}`,
      );
    case Code.DeadlineExceeded:
    case Code.Canceled:
      logger.debug(
        `kagent request timed out for installation '${installationName}'`,
        { endpoint: context.endpoint },
      );
      if (context.timeoutIsPending) {
        return turnPendingError(
          `The agent on installation '${installationName}' has not finished within ${turnTimeoutMs}ms; the turn is still running.`,
        );
      }
      return upstreamError(
        `The kagent API for installation '${installationName}' did not respond in time.`,
      );
    case Code.Unavailable:
      // A gateway or kagent answering 5xx: deployed and unwell, not absent.
      logger.debug(
        `kagent API unavailable for installation '${installationName}'`,
        { error: reason },
      );
      return upstreamError(
        `The kagent API for installation '${installationName}' is unavailable: ${reason}`,
      );
    default:
      if (context.unsupportedOperation && isUnsupportedOperation(reason)) {
        return context.unsupportedOperation(reason);
      }
      logger.debug(
        `kagent API returned an error for installation '${installationName}'`,
        { code: Code[connectError.code], error: reason },
      );
      return upstreamError(
        `The kagent API for installation '${installationName}' failed: ${reason}`,
      );
  }
}

/**
 * Whether an A2A failure message is the gateway's "one active task per
 * instance" refusal, which a2a-go reports as an *unsupported operation*.
 */
function isUnsupportedOperation(reason: string): boolean {
  return /already has an active task|unsupported operation/i.test(reason);
}
