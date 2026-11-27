---
'@giantswarm/backstage-plugin-auth-backend-module-gs': patch
---

The sign-in resolver no longer treats `giantswarm-simple-oidc` as a connector that federates to gazelle's Dex. No installation registers it any more; a sign-in through a connector of that name is resolved like any other one.
