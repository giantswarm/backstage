---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The credential form cancels a replacement that agent-manager refuses because the objects that use the credential changed, so the request no longer stays pending until it expires. When that cancel fails, the form offers Cancel request.
