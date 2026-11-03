---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Try a notification seen-mark write again, twice with backoff, when its read of
the stored marks fails transiently (a 5xx or the network), before it rejects.
"Mark all read" in the Notification inbox no longer fails on a single 503.
