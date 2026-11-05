---
'@giantswarm/backstage-plugin-agent-platform-backend': minor
---

Report a failed kagent call to Sentry once, as one issue per call and cause
instead of one per route and installation. A kagent call that fails with a 5xx
(a timeout, an unavailable controller, an internal error) is answered by the
agent-platform router with the same 500 and body as before, and logged once at
`warn` as `kagent <call> <cause>`, for example
`kagent SessionService/ListSessions timed out`, with the installation, the
Connect code and the request id in the log metadata, and the message for an
unavailable or timed-out call, which the transport or the gateway wrote. The
message of any other failure is kagent's own and may name a user or a session,
so it stays out of the log.
Backstage's error middleware no longer reports it a second time. This covers
every kagent call, not only the session list, and carries the request id of
every call that sent one. A session list refused with another 4xx (an expired
token, a conflict) is now logged at `info` instead of `warn`, as
`kagent SessionService/ListSessions failed with status <status>`, without the
installation in the message, so it no longer reaches Sentry. The error text the
person sees is unchanged.

The kagent transport now pings its HTTP/2 connection every 3 s, open or idle,
and takes it for dead when a ping goes unanswered for 5 s, long enough to ride
out a stalled event loop without ending the turns streaming on a healthy
connection. A connection that died silently is replaced within 8 s, before the
10 s request timeout, rather than holding every call on it until the timeout. `@connectrpc/connect` and
`@connectrpc/connect-node` move to 2.3.0, which no longer drops the session's
error listener when a dead session is replaced.

A new histogram, `kagent_client_call_duration` (seconds), records every unary
kagent call with the attributes `installation`, `method` and `outcome`; see
`docs/logging.md`, "Backend metrics". The backend warns at startup when
`agentPlatform.kagent.timeoutMs` is not above the keepalive's 8 s.
