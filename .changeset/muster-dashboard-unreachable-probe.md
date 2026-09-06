---
'@giantswarm/backstage-plugin-muster': patch
---

The muster dashboard no longer runs its tool-count probe against an
installation the backend reports as not reachable from this portal; the
request could only time out and reach Sentry as a 500. The badge already said
"Not reachable" -- now nothing is sent, the same as on the other live-MCP
screens.
