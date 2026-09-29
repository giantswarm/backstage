---
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

A kagent API 401 or 403 now carries the reason the edge or kagent gave, e.g. "Not authenticated against the kagent API for installation 'gazelle': authentication failure: token uses the unknown key …", so an expired token, a token from a recreated Dex and a missing token no longer read the same. A denial without a reason keeps today's message; the full reason is logged at debug.
