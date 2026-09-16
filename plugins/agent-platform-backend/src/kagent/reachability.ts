import { Code, ConnectError, createClient } from '@connectrpc/connect';
import { Http2SessionManager } from '@connectrpc/connect-node';
import {
  classifyProbeFailure,
  DEFAULT_PROBE_TIMEOUT_MS,
  EndpointProbeResult,
  eventLoopUtilizationMeter,
  LoopUtilizationMeter,
  timedOutResult,
} from '@giantswarm/backstage-plugin-gs-node';
import { SystemService } from './gen/kagent/api/v1alpha1/system_pb';
import { isSocketFailure } from './errors';
import { createKagentTransport } from './transport';

/**
 * Unauthenticated reachability probe for a kagent controller's gRPC origin —
 * the gRPC analogue of gs-node's HTTP `probeEndpoint`, with the same contract.
 *
 * One `SystemService/GetVersion` call with no token, no identity and no user
 * data, read only for the fact that something answered. Behind agentgateway's
 * JWT policy the normal answer is `Unauthenticated`, which proves the route
 * exists from where the portal runs exactly as a 401 did on the REST door; a
 * `NotFound`/`Unimplemented` (a gateway that routes the host but not the
 * service) or an `Internal` also means something answered. Only a socket-level
 * failure — no such host, nothing listening, a TLS refusal — or no answer within
 * the budget is "not reachable", with a one-line reason built from error codes
 * only (never from messages, which embed the hostname). No answer while this
 * process was too busy to have noticed one is inconclusive, as for the HTTP
 * probe (see gs-node's `STARVED_LOOP_UTILIZATION`).
 */
export async function probeKagentGrpc(
  url: string,
  options: {
    timeoutMs?: number;
    now?: () => number;
    /** Overridable for tests; defaults to Node's event-loop utilization. */
    loopMeter?: LoopUtilizationMeter;
  } = {},
): Promise<EndpointProbeResult> {
  const {
    timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
    now = Date.now,
    loopMeter = eventLoopUtilizationMeter,
  } = options;

  try {
    // Fail before any network activity on a URL that cannot be probed, with a
    // reason that does not echo the string back.
    // eslint-disable-next-line no-new
    new URL(url);
  } catch {
    return {
      reachable: false,
      reason: 'invalid endpoint URL',
      checkedAt: now(),
    };
  }

  // The probe's own HTTP/2 session, closed once the probe has settled. The
  // installations' shared transports keep theirs alive between calls; a probe
  // makes one call every few minutes and would otherwise leave a session
  // idling for connect-node's 15-minute default each time.
  const sessionManager = new Http2SessionManager(url);
  const system = createClient(
    SystemService,
    createKagentTransport(
      { name: 'probe', apiBaseUrl: url },
      { sessionManager },
    ),
  );
  const loopBusy = loopMeter();
  try {
    await system.getVersion({}, { timeoutMs });
    return { reachable: true, checkedAt: now() };
  } catch (error) {
    const connectError = ConnectError.from(error);
    if (
      connectError.code === Code.DeadlineExceeded ||
      connectError.code === Code.Canceled
    ) {
      return timedOutResult(timeoutMs, loopBusy(), now());
    }
    if (isSocketFailure(connectError)) {
      return {
        reachable: false,
        reason: classifyProbeFailure(
          connectError.cause ?? connectError,
          timeoutMs,
        ),
        checkedAt: now(),
      };
    }
    // Anything else — a refused token, a route without the service, a 5xx from
    // the gateway or the controller — is an answer, and an answer is the proof.
    return { reachable: true, checkedAt: now() };
  } finally {
    sessionManager.abort();
  }
}
