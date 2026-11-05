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
