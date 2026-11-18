import type { Transport } from '@connectrpc/connect';
import {
  createGrpcTransport,
  type Http2SessionManager,
} from '@connectrpc/connect-node';
import {
  kagentCallDurationInterceptor,
  type KagentCallHistogram,
} from './metrics';

/** One installation's kagent controller. */
export interface KagentInstallationConfig {
  /** Installation name, as in `gs.installations`. */
  name: string;
  /**
   * The gRPC origin of the kagent controller route — `https://<host>[:port]`,
   * no path. The service paths (`/kagent.api.v1alpha1.SessionService/…`,
   * `/lf.a2a.v1.A2AService/…`) are what the transport appends.
   */
  apiBaseUrl: string;
}

/**
 * Derive the controller's gRPC origin for an installation from its base domain.
 *
 * The hostname matches the `agent-platform-connectivity` chart's controller
 * route hostname (`agent-platform.kagent.controllerHostname`, which defaults to
 * `agentgateway.<codename>.<base>`, exactly `agentgateway.<baseDomain>`), on
 * which the chart's `GRPCRoute` serves the controller's services through
 * agentgateway. It is the same origin the chart writes into the Backstage
 * app-config as `apiBaseUrl` when it renders that file itself. No path: gRPC is
 * matched by service, not by prefix.
 *
 * `kagent.<baseDomain>` is a different route: the kagent UI's `HTTPRoute`
 * behind oauth2-proxy (`kagent.uiRoute.hostname`), which does not carry gRPC
 * — a gRPC call there ends with "server closed the stream without sending
 * trailers".
 *
 * Returns undefined when the installation has no `baseDomain`.
 */
export function deriveKagentApiBaseUrl(
  baseDomain: string | undefined,
): string | undefined {
  if (!baseDomain) {
    return undefined;
  }
  return `https://agentgateway.${baseDomain}`;
}

/** Whether a configured URL is absolute and http(s), so a transport can use it. */
export function isAbsoluteHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * How often an HTTP/2 connection to a controller is pinged, open or idle,
 * unless a response arrived in the meantime. Also the age past which an idle
 * connection is pinged before a request is sent on it.
 */
export const KAGENT_PING_INTERVAL_MS = 3_000;

/**
 * How long a ping may go unanswered before the connection is taken for dead:
 * destroyed, its streams failed as `Unavailable`, and a new one opened for the
 * next call.
 *
 * Sized for this process, not for the network: a round trip to any
 * installation takes milliseconds, but the answer is only read once the event
 * loop gets to it, and connect-node counts the time until then (it also
 * destroys a session whose ping came back later than this). The transport is
 * shared by every call to the installation, turn streams included, so a stall
 * longer than this (a burst of work at startup, a long GC under a CPU quota)
 * would end every turn in flight on a healthy connection. 5 s is past any
 * stall this backend should see; `nodejs_eventloop_delay_max` says how close
 * it comes.
 */
export const KAGENT_PING_TIMEOUT_MS = 5_000;

/**
 * The keepalive of a transport's HTTP/2 connection.
 *
 * Without it (connect-node's default, no ping at all) a connection that dies
 * silently, with no FIN or RST reaching this process (a load balancer or NAT
 * dropping the flow, a gateway pod gone with its node), is never noticed.
 * Every call on it waits out its own deadline, and since the calls keep the
 * connection from going idle, nothing replaces it: the installation's reads
 * time out for as long as people keep reading it (giantswarm/giantswarm#39003,
 * where kagent and the gateways answered in milliseconds throughout).
 *
 * With it, a dead connection is found within interval + timeout, 8 s, which is
 * under the 10 s `DEFAULT_KAGENT_TIMEOUT_MS` of the call waiting on it: that
 * call fails as `Unavailable`, and the next one opens a new connection rather
 * than timing out on the same one. The timeout takes 5 of those 8 s, to ride
 * out a stalled event loop (see {@link KAGENT_PING_TIMEOUT_MS}), which leaves
 * 3 s for the interval. An idle connection is pinged too, which finds it dead
 * before a person's request does and keeps a flow alive through whatever drops
 * idle ones. A ping every 3 s on a handful of connections is nothing to the
 * peer; a peer that refused it (`too_many_pings`) would have connect-node
 * double the interval.
 */
const KEEPALIVE = {
  pingIntervalMs: KAGENT_PING_INTERVAL_MS,
  pingTimeoutMs: KAGENT_PING_TIMEOUT_MS,
  pingIdleConnection: true,
} as const;

/**
 * The native gRPC transport toward one installation's controller.
 *
 * **HTTP/2 end to end**, deliberately: the controller serves gRPC, gRPC-Web and
 * A2A on one h2c port, and the connectivity chart's route carries native gRPC
 * over h2 through agentgateway — so this process speaks gRPC the way any other
 * client of that route does, and the same route serves Swarmgeist. An `https://`
 * origin negotiates h2 over TLS (Node's `http2` honours `NODE_EXTRA_CA_CERTS`,
 * which is how a private CA reaches this process); an `http://` origin is
 * plaintext h2c, which only an in-cluster Service URL should ever be.
 *
 * One transport per installation, shared by every call: connect-node keeps the
 * HTTP/2 session alive between calls, pings it ({@link KEEPALIVE}) and reopens
 * it when it drops. A caller that wants to close the session itself (the
 * reachability probe, one call every few minutes) passes its own
 * `sessionManager` and aborts it afterwards; the session manager carries the
 * ping options, so such a session is not pinged unless its manager says so.
 */
export function createKagentTransport(
  installation: KagentInstallationConfig,
  options: {
    sessionManager?: Http2SessionManager;
    /** Records the duration of every unary call (`kagent/metrics.ts`). */
    callDuration?: KagentCallHistogram;
  } = {},
): Transport {
  // connect-node's gRPC transport is HTTP/2 only — gRPC has no HTTP/1.1 form —
  // so nothing here can fall back to gRPC-Web.
  return createGrpcTransport({
    baseUrl: installation.apiBaseUrl,
    ...KEEPALIVE,
    ...(options.sessionManager && { sessionManager: options.sessionManager }),
    ...(options.callDuration && {
      interceptors: [
        kagentCallDurationInterceptor(installation.name, options.callDuration),
      ],
    }),
  });
}
