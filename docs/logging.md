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

Backstage's error middleware (`MiddlewareFactory.error()`) logs every 5xx a
route throws at `error`, with the error's message. A failure your code has
already logged, or whose message names an installation because a person reads
it, is answered by the router instead of thrown: `avatarRouter.ts` in
`agent-platform-backend`; `musterUnreachableErrorHandler()` from `gs-node`
for an installation's muster that cannot be reached; and `kagentErrorHandler.ts`
in `agent-platform-backend` for a kagent call that failed, which logs it once
as `kagent <call> <cause>`.

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
