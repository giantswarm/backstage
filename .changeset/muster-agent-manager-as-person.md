---
'@giantswarm/backstage-plugin-muster-backend': patch
---

On a muster installation configured without an `authProvider`, `/call` and `/call/progress` run only muster's own core tools and refuse every other tool (an aggregated server's `x_*` tools such as agent-manager's, workflows, meta-tools, per-user auth) with a 403, instead of running it under muster's shared identity.
