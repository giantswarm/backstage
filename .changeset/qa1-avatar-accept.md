---
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

The avatar proxy asks the avatar service for `image/*` instead of `image/png`, and a failed answer's reason names its content type, which shows when the avatars host is not routed to the avatar service.
