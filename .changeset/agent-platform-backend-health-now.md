---
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

`/health` also reports the server's clock (`now`, epoch milliseconds), which the
frontend measures the age of cluster objects against.
