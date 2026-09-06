---
'@giantswarm/backstage-plugin-gs-node': minor
'@giantswarm/backstage-plugin-muster-backend': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
---

The muster and agent-platform backends report, per installation, whether its
muster or kagent endpoint is reachable from this portal, learned from an
unauthenticated probe (no credentials, no user data; any HTTP answer proves
the route, DNS/connection/TLS failure or a 3 s timeout means unreachable),
cached five minutes. `GET /api/muster/installations` and
`GET /api/agent-platform/kagent/installations` gain `reachable: true | false |
'unknown'` and `reason`. The Sessions tab no longer queries an installation
reported unreachable -- so its 10 s timeout and the 500 per page view stop --
and lists it as "not reachable from this portal"; the MCP Servers tab does
not run its session probe against an unreachable muster and says so instead
of offering a connect that cannot help.
