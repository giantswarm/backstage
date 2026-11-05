import type {
  MetricsService,
  MetricsServiceHistogram,
} from '@backstage/backend-plugin-api/alpha';
import { Code, ConnectError, type Interceptor } from '@connectrpc/connect';
import { isSocketFailure } from './errors';

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
 * (15 ms through the gateway), and around the 7 s at which the keepalive
 * gives a dead connection up and the 10 s request timeout. The last two cover
 * `SendMessage`, which waits out a turn (30 s by default).
 */
const BUCKETS = [
  0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 7.5, 10, 15, 30, 60,
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
 * How a call ended, in one word: `ok`; `timeout` for our own deadline
 * (`DeadlineExceeded`); `unreachable` when nothing answered at the socket
 * level (no such host, connection refused, a TLS refusal: kagent not deployed
 * there); otherwise the Connect code in snake case: `unavailable` (a gateway's
 * 5xx, or a connection the keepalive found dead), `unauthenticated`,
 * `not_found`, `internal`, `canceled`, …
 */
export function kagentCallOutcome(error: unknown): string {
  const connectError = ConnectError.from(error);
  if (connectError.code === Code.DeadlineExceeded) {
    return 'timeout';
  }
  if (isSocketFailure(connectError)) {
    return 'unreachable';
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
    const method = `${request.service.name}/${request.method.name}`;
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
      record(kagentCallOutcome(error));
      throw error;
    }
  };
}
