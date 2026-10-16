---
'@giantswarm/backstage-plugin-muster': patch
---

The background read of which MCP servers need the person's sign-in no longer opens the "Login Required" dialog: it uses the current portal session only and stays quiet once that session has expired, and the servers' display names are read once.
