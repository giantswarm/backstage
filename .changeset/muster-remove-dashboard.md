---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': patch
---

MCP Servers section: the **Dashboard** view is removed and **Servers** is the
section's first view. The Servers view now opens with the muster endpoint (with
a copy button) and a totals line, also when the installation lists no servers:
servers, how many are healthy and, with a muster session, tools (`…` while the
count loads). Deactivated servers are counted apart rather than as unhealthy,
and a hint explains the count: amber once more than 10% of the rest are not
healthy. The old `/agent-platform/muster/dashboard` path redirects to the
Servers view, keeping `?installation=`. The backend's `/installations` reply no
longer carries the unused `source` field.
