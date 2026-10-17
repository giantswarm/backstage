---
'@giantswarm/backstage-plugin-kubernetes-react': patch
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-muster': patch
'app': patch
---

Every session-expired notice reads "Your session expired, sign in again.",
from the one `SESSION_EXPIRED_MESSAGE` the kubernetes-react plugin exports; the
Cluster access popover no longer says "Your session expired -- sign in again",
and a rejected session reads "Your session was rejected, sign in again."
