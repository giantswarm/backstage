---
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

Templates mint their cluster tokens when the person selects Create instead of while the form is filled, when they could expire before submit. Tokens are minted only for the `GSOIDCToken` fields in the form as submitted. An installation the portal cannot mint for without a sign-in is left out as before. A declined or failed sign-in stops the submit. New export `useStartTemplateTask` starts a template's task with fresh tokens and reports the new `Scaffolder.taskStarted` event. `getInstallationOidcToken` now throws `InstallationTokenUnavailableError` (new export) for an installation it does not know or one that returned no token. When Create fails, the template wizard shows an alert that keeps the entries and asks the person to select Create again.
