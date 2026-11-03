---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Try a notification seen-mark write the person waits on (a row opened, "Mark
all read") again, twice with backoff, when its read or write of the stored
marks meets a 5xx or the network, before it rejects. "Mark all read" in the
Notification inbox no longer fails on a single 503. A stored-setting write
opts in with `retry` on its update.
