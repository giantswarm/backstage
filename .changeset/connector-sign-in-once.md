---
'@giantswarm/backstage-plugin-muster': patch
---

A connector whose sign-in settings muster looks up (no issuer under Advanced) is registered with `spec.auth.grantScope: subject` when people sign in once, the wizard's default: one sign-in now serves the portal and every agent conversation instead of each conversation asking again. muster applies the setting to the authorization server it discovers (giantswarm/muster#1755); the choice is no longer disabled without an issuer, and an edit keeps a registered server's `spec.auth.grantScope`.
