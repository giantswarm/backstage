---
'@giantswarm/backstage-plugin-agent-platform': patch
---

An Agents list row names an organization's agent's organization as
"Organization: acme", its first fact, so it is not read as the environment
beside it, and a platform agent's row no longer shows a "None" and an info
icon without a label. The agent's page and the Organization filter keep
"None". The row's facts sit on one baseline.
