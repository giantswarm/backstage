# Logging and error reporting

The backend root logger forwards **every `warn` and `error` log to Sentry**
(winston Sentry transport at `level: 'warn'` in
`packages/backend-common/src/rootLogger.ts`). Pick log levels by whether a human
should act, not by how bad it sounds:

- `logger.error` / `logger.warn`: a real, actionable fault (a dependency is
  down, a credential is invalid, an invariant broke). These become Sentry issues.
- `logger.info` / `logger.debug`: expected, already-handled outcomes, even when a
  request "fails": an upstream 4xx you translate into a clean response, an expired
  user token, a retry that will recover. Logging these at `warn` floods Sentry.

If a failure is handled gracefully (you return a structured error to the caller
and no user is impacted), it is `info`/`debug`, not `warn`. Keep high-cardinality
values (installation name, entity id, raw response bodies) out of the _message_
of a `warn`/`error`: Sentry fingerprints on the message, so one root cause fans
out into one issue per value. Put those in structured metadata instead.

Metadata lands in Sentry too, as the event's extra data. An upstream's own error
message can quote a user, a session or a prompt, so it does not go into the
metadata of a `warn`/`error` unless the transport or a gateway wrote it: the
kagent handler below keeps the message of an `Unavailable` or
`DeadlineExceeded` call and leaves out every other code's.

Backstage's error middleware (`MiddlewareFactory.error()`) logs every 5xx a
route throws at `error`, with the error's message. A failure your code has
already logged, or whose message names an installation because a person reads
it, is answered by the router instead of thrown: `avatarRouter.ts` in
`agent-platform-backend`, and, for a 503, `gs-node`'s
`ReportedServiceUnavailableError` with `reportedErrorHandler()` mounted last on
the router. Throw a subclass of the error after logging the failure once, as a
warning with a fixed message; the handler answers it with the body the
middleware would send. `MusterUnreachableError` (an installation's muster
cannot be reached) and `MimirUnavailableError` (an installation's Mimir could
not answer a query) are two. An error that belongs to another class is marked
with `markReported()` after it is logged, and the handler answers it with its
own `status`. A router that answers some other error itself builds the body
with `errorResponseBody()` from `gs-node`, so the frontend reads it as it reads
the middleware's: `kagentErrorHandler.ts` in `agent-platform-backend` does, for
a kagent call that failed with a 500, which it logs once as
`kagent <call> <cause>`.

A muster tool error (`MusterToolError` in `gs-node`) names the `tool`, its MCP
`server` and the `installation`, never the arguments, and carries the `kind`
of a failure the portal knows, with its status (`MUSTER_TOOL_ERROR_STATUS`,
next to the auth_required case in `MusterMcpClient`). The refusals of the
Agent Platform's MCP servers (`mcpToolRefusalOf` in `gs-common`) and muster's
refusals of a connector write answer 4xx and stay out of Sentry. A muster
rollout's `interrupted` is logged at `info` and answered 503 by
`reportedErrorHandler()`. A timeout (504), a server muster holds no connection
to (503), a missing tool (502) and a model-manager with no backend
(`no_backend`, 503) are reported. A tool error of no known kind is answered
502 (`MUSTER_UNKNOWN_TOOL_ERROR_STATUS`), a failure upstream of the portal,
and reported too. `normalizeSentryEvent` groups the events as
`['MusterToolError', <kind>, <server>]` for those four, which belong to a
whole server, and as `['MusterToolError', <kind>, <tool>]`
otherwise, the tool without an Organization's or a workflow's name, or by the
message with its quoted values replaced where the kind is unknown. It tags
`tool` and `server`.

Frontend equivalent: `SentryErrorReporter`
(`packages/app/src/apis/errorReporter/`); `warning`-level `notify()` calls also
reach Sentry.

Triage of what arrives in Sentry: the `sentry-triage` skill.

## Backend metrics

With the Helm value `observability.metrics.enabled`, the backend exports
OpenTelemetry metrics in the Prometheus format on its `metrics` port
(`OTEL_METRICS_EXPORTER=prometheus`, started in
`packages/backend/src/instrumentation.js`): the Node.js runtime's, such as
`nodejs_eventloop_delay_max`, and the plugins' own.

A backend plugin records its own through Backstage's metrics service,
`metricsServiceRef` from `@backstage/backend-plugin-api/alpha`, which
`createBackend()` registers by default: a thin wrapper around the OpenTelemetry
meter, with the plugin as the instrumentation scope (the `otel_scope_name`
label, `backstage-plugin-<pluginId>`). Create each instrument once, not per
request, and keep its attributes low-cardinality: an installation, a method, an
outcome, never a session id, an entity ref or a person. Without an exporter the
instruments record nothing.

| Metric (Prometheus)                                | Attributes                          | Recorded by                                                            |
| -------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| `kagent_client_call_duration` (histogram, seconds) | `installation`, `method`, `outcome` | `agent-platform-backend`, `kagent/metrics.ts`: every unary kagent call |

`kagent_client_call_duration` is scraped as `_bucket`, `_sum` and `_count`.
`method` is the RPC as `Service/Method`, for example
`SessionService/ListSessions`. `outcome` is `ok`; `unreachable` when nothing
answered at the socket level (kagent not deployed there); `timeout` when the
portal's own deadline ran out (10 s by default); otherwise the Connect code in
snake case: `deadline_exceeded` (a deadline the controller or the gateway ran
out of), `unavailable` (a gateway's 5xx, or a connection whose keepalive ping
went unanswered), `unauthenticated`, `permission_denied`, `not_found`,
`internal`, `canceled` and so on. Each call on the wire is one observation, a retry
included; streams (a turn's events, a task subscription) are not recorded. For
example, the share of an installation's session lists that timed out:

```promql
sum(rate(kagent_client_call_duration_count{method="SessionService/ListSessions", outcome="timeout"}[5m])) by (installation)
  / sum(rate(kagent_client_call_duration_count{method="SessionService/ListSessions"}[5m])) by (installation)
```
