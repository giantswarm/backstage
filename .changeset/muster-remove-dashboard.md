---
'@giantswarm/backstage-plugin-muster': minor
---

MCP Servers section: the **Dashboard** view is removed and **Servers** is the
section's first view. The Servers view now opens with the muster endpoint (with
a copy button) and a totals line — servers, how many are healthy (amber once
more than 10% are not) and, with a muster session, tools. The old
`/agent-platform/muster/dashboard` path redirects to the Servers view, keeping
`?installation=`.
