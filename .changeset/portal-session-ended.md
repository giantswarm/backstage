---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

When the portal refuses the person's session token (for example after a restart of a portal without a database), the Agent Platform pages say that the portal session ended and to sign in again, with a Sign in again button, instead of "Failed user token verification". The credential form drops the typed value and opens the same request again after the sign-in. muster's `MusterUnauthorizedError` keeps the name the answer gives the error (`errorName`), so a page can tell the portal's own refusal from muster-backend's.
