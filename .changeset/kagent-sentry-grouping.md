---
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

Report a failed kagent call to Sentry once, as one issue per call and cause
instead of one per route and installation. A kagent call that fails with a 5xx
(a timeout, an unavailable controller, an internal error) is answered by the
agent-platform router with the same 500 and body as before, and logged once at
`warn` as `kagent <call> <cause>`, for example
`kagent SessionService/ListSessions timed out`, with the installation, the
Connect code, the controller's message and the request id in the log metadata.
Backstage's error middleware no longer reports it a second time. This covers
every kagent call, not only the session list. A session list refused with
another 4xx is still logged at `warn`, now as
`kagent SessionService/ListSessions failed with status <status>`, without the
installation in the message. The error text the person sees is unchanged.

The kagent transport now pings its HTTP/2 connection every 5 s, open or idle,
and takes it for dead when a ping goes unanswered for 2 s. A connection that
died silently is replaced within 7 s, before the 10 s request timeout, rather
than holding every call on it until the timeout. `@connectrpc/connect` and
`@connectrpc/connect-node` move to 2.3.0, which no longer drops the session's
error listener when a dead session is replaced.

A new histogram, `kagent_client_call_duration` (seconds), records every unary
kagent call with the attributes `installation`, `method` and `outcome`; see
`docs/logging.md`, "Backend metrics".
