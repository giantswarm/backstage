---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Starting a session again after agent-manager refused the start uses a new idempotency key, so the retry starts a session instead of failing with "request_id belongs to a deleted Session". A retry after a failure without an answer (network, timeout) still reuses the key.
