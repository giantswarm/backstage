---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Restarting a session after agent-manager refused the start uses a new idempotency key; a retry after a failure without an answer reuses it.
