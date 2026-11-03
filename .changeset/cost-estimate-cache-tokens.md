---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The estimated cost of a session, and the estimate the Usage pages fall back to,
divide the gateway's spend by each token once. The gateway counts cache reads
and writes inside `input` as well as on their own, and adding them on top
counted cached input twice, which halved the rate and the estimate.
