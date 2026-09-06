import { LoggerService } from '@backstage/backend-plugin-api';
import { EndpointProbeResult, probeEndpoint } from './probeEndpoint';

/** How long a probe answer is served before the endpoint is probed again. */
export const DEFAULT_REACHABILITY_TTL_MS = 5 * 60_000;

/**
 * `'unknown'` until the first probe of the endpoint has settled; a boolean
 * afterwards. Routes report it verbatim so a frontend can tell "not probed
 * yet" from "probed and unreachable" -- only the latter is acted on.
 */
export type Reachability = boolean | 'unknown';

export type ReachabilityState = {
  reachable: Reachability;
  /** The probe's reason, when the endpoint is unreachable. */
  reason?: string;
  /** Epoch milliseconds of the answer being served; absent while unknown. */
  checkedAt?: number;
};

/**
 * The two fields a route exposes per installation: `reachable` always, and
 * `reason` only when there is one -- so a reachable entry has no `reason` key
 * at all rather than `reason: undefined`, and JSON consumers see one shape.
 */
export function reachabilityFields(state: ReachabilityState): {
  reachable: Reachability;
  reason?: string;
} {
  return {
    reachable: state.reachable,
    ...(state.reason !== undefined && { reason: state.reason }),
  };
}

export type ReachabilityCacheOptions = {
  /** Answer lifetime before a background re-probe. Default 5 min. */
  ttlMs?: number;
  /** The probe; overridable for tests. Defaults to {@link probeEndpoint}. */
  probe?: (url: string) => Promise<EndpointProbeResult>;
  /**
   * Receives one INFO line per endpoint whenever its reachability *changes*
   * (including the first answer). Nothing is logged per request or per
   * unchanged re-probe, so a pod's log carries exactly the state transitions.
   */
  logger?: LoggerService;
  /** Overridable clock for tests. */
  now?: () => number;
};

/**
 * Per-URL cache of unauthenticated reachability probes.
 *
 * Lazy and never blocking: {@link get} is synchronous and answers from the
 * cache, kicking off the first probe (or a background refresh once the answer
 * is older than the TTL) as a side effect. A request therefore never waits on
 * a probe -- it sees `'unknown'` until the first answer lands, and the previous
 * answer while a refresh is in flight. Concurrent callers share one in-flight
 * probe per URL.
 *
 * No timers of its own: a probe only ever runs because something asked (or
 * because {@link refresh} was called to warm the cache), so an idle process
 * probes nothing and the cache needs no shutdown.
 */
export class ReachabilityCache {
  private readonly entries = new Map<string, EndpointProbeResult>();
  private readonly inFlight = new Map<string, Promise<EndpointProbeResult>>();
  private readonly ttlMs: number;
  private readonly probe: (url: string) => Promise<EndpointProbeResult>;
  private readonly logger: LoggerService | undefined;
  private readonly now: () => number;

  constructor(options: ReachabilityCacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_REACHABILITY_TTL_MS;
    this.probe = options.probe ?? (url => probeEndpoint(url));
    this.logger = options.logger;
    this.now = options.now ?? Date.now;
  }

  /**
   * The cached answer for `url`, without waiting for anything. Starts the
   * first probe when there is no answer yet, and a background refresh when
   * the answer is stale; the stale answer is still served meanwhile.
   */
  get(url: string): ReachabilityState {
    const entry = this.entries.get(url);
    if (!entry) {
      void this.refresh(url);
      return { reachable: 'unknown' };
    }
    if (this.now() - entry.checkedAt >= this.ttlMs) {
      void this.refresh(url);
    }
    return {
      reachable: entry.reachable,
      ...(entry.reason !== undefined && { reason: entry.reason }),
      checkedAt: entry.checkedAt,
    };
  }

  /**
   * Probe `url` now and cache the answer. Deduplicated: while a probe of the
   * same URL is in flight every caller gets that probe's promise. The probe
   * function is expected to resolve for every outcome; should it throw, the
   * endpoint is recorded as unreachable rather than left unknown forever.
   */
  refresh(url: string): Promise<EndpointProbeResult> {
    const pending = this.inFlight.get(url);
    if (pending) {
      return pending;
    }
    const run = this.probe(url)
      .catch((): EndpointProbeResult => ({
        reachable: false,
        reason: 'probe failed',
        checkedAt: this.now(),
      }))
      .then(result => {
        // A probe that resolves with something other than a result (a bug in an
        // injected probe) is recorded as unreachable, like a throwing one.
        const settled: EndpointProbeResult =
          result && typeof result.reachable === 'boolean'
            ? result
            : {
                reachable: false,
                reason: 'probe failed',
                checkedAt: this.now(),
              };
        this.record(url, settled);
        return settled;
      })
      .finally(() => {
        this.inFlight.delete(url);
      });
    this.inFlight.set(url, run);
    return run;
  }

  private record(url: string, result: EndpointProbeResult) {
    const previous = this.entries.get(url);
    this.entries.set(url, result);
    const changed =
      !previous ||
      previous.reachable !== result.reachable ||
      previous.reason !== result.reason;
    if (changed) {
      this.logger?.info(
        result.reachable
          ? `Endpoint reachable: ${url}`
          : `Endpoint not reachable from this portal: ${url} (${result.reason})`,
      );
    }
  }
}
