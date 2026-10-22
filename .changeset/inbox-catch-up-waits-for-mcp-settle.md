---
'@giantswarm/backstage-plugin-muster': patch
'app': patch
---

A server waiting for the person's MCP sign-in when the portal loads is in the
notification inbox's summary toast again. The inbox's first read now waits the
few seconds muster's sign-in status takes to settle, once muster has answered,
instead of taking the waiting server in later as quietly unread. The status
says when it has settled (`isSettled`).
