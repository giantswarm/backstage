---
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-muster': patch
---

Templates mint a fresh cluster token when the person selects Create instead of sending the one fetched while the form was filled, which could have expired. New exports `TemplateSecretRefreshProvider` and `useRefreshTemplateSecrets` let the template wizard refresh registered secrets before it submits. When the sign-in has expired, or the task can't be started, the wizard shows an alert with a retry and keeps the entries. `isSessionExpiredError` now also recognises a declined Login Required prompt and a closed login popup.
