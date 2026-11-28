---
'@giantswarm/backstage-plugin-muster': patch
---

A connector with looked-up sign-in settings is registered with `spec.auth.grantScope: subject` when people sign in once (the wizard default); an edit keeps a registered `grantScope`.
