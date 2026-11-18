import type {
  MetricsService,
  MetricsServiceHistogram,
} from '@backstage/backend-plugin-api/alpha';
import { Code, ConnectError, type Interceptor } from '@connectrpc/connect';
import { isSocketFailure, rpcName } from './errors';

/**
 * The duration of the portal's unary calls to a kagent controller, in seconds,
 * by installation, method and outcome. Scraped from the backend's Prometheus
 * endpoint as `kagent_client_call_duration_bucket`, `_sum` and `_count`.
 * Documented in `docs/logging.md`, "Backend metrics".
 */
export const KAGENT_CALL_DURATION_METRIC = 'kagent.client.call.duration';

/**
 * The attributes of one recorded call. All of them low-cardinality: tens of
 * installations, a dozen methods, a handful of outcomes. Never a session id, a
 * task id or a person.
 */
export type KagentCallAttributes = {
  /** The installation's name, as in `gs.installations`. */
  installation: string;
  /** `Service/Method`: `SessionService/ListSessions`. */
  method: string;
  /** See {@link kagentCallOutcome}. */
  outcome: string;
};

export type KagentCallHistogram = MetricsServiceHistogram<KagentCallAttributes>;

/**
 * Bucket bounds, in seconds: fine below a second, where a healthy call lands
 * (15 ms through the gateway), and around the 8 s by which the keepalive
 * gives a dead connection up and the 10 s request timeout. The last two cover
 * `SendMessage`, which waits out a turn (30 s by default).
 */
const BUCKETS = [
  0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 8, 10, 15, 30, 60,
];

export function createKagentCallHistogram(
  metrics: MetricsService,
): KagentCallHistogram {
  return metrics.createHistogram<KagentCallAttributes>(
    KAGENT_CALL_DURATION_METRIC,
    {
      description:
        "Duration of the portal's unary calls to a kagent controller, by installation, method and outcome.",
      unit: 's',
      advice: { explicitBucketBoundaries: BUCKETS },
    },
  );
}

/**
 * How a call ended, in one word: `ok`; `unreachable` when nothing answered at
 * the socket level (no such host, connection refused, a TLS refusal: kagent
 * not deployed there), whatever the code; `timeout` when the portal's own
 * deadline ran out (`ownDeadline`); otherwise the Connect code in snake case:
 * `deadline_exceeded` (a deadline the controller or the gateway ran out of),
 * `unavailable` (a gateway's 5xx, or a connection the keepalive found dead),
 * `unauthenticated`, `not_found`, `internal`, `canceled`, … The order follows
 * `mapConnectError`, which also reads a socket-level cause first.
 */
export function kagentCallOutcome(error: unknown, ownDeadline = false): string {
  const connectError = ConnectError.from(error);
  if (isSocketFailure(connectError)) {
    return 'unreachable';
  }
  if (connectError.code === Code.DeadlineExceeded && ownDeadline) {
    return 'timeout';
  }
  return Code[connectError.code]
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * A Connect interceptor that records every unary call on the transport, retries
 * and all: one call on the wire, one observation. Streams (a turn's events, a
 * task subscription) are left out: their duration is the turn's, not the
 * controller's.
 */
export function kagentCallDurationInterceptor(
  installation: string,
  histogram: KagentCallHistogram,
): Interceptor {
  return next => async request => {
    if (request.stream) {
      return next(request);
    }
    const method = rpcName(request.method);
    const started = performance.now();
    const record = (outcome: string) =>
      histogram.record((performance.now() - started) / 1000, {
        installation,
        method,
        outcome,
      });
    try {
      const response = await next(request);
      record('ok');
      return response;
    } catch (error) {
      // The request's signal carries the call's deadline: aborted when ours
      // ran out (or the caller hung up), not when the controller answered
      // `DeadlineExceeded` itself.
      record(kagentCallOutcome(error, request.signal.aborted));
      throw error;
    }
  };
}
