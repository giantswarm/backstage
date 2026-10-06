---
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

Templates mint their cluster tokens when the person selects Create instead of while the form is filled, when they could expire before submit. `GSScaffolderApiClient.scaffold` mints them for every caller, once per installation, for the `GSOIDCToken` fields in the form as submitted (including array items and the selected `oneOf`/`anyOf` option), and routes the task to the installation of the first such field. It now takes `kubernetesApi` and `kubernetesAuthProvidersApi`. A token that fails for any reason other than a sign-in is left out as before. A sign-in that did not complete stops the submit with the new `TemplateSignInError` once every sign-in it asked for has settled. New export `useStartTemplateTask` starts a template's task and reports the new `Scaffolder.taskStarted` event. `ClusterTokenError`, `isSessionExpiredError` and the new `isSignInDeclinedError` are exported from `@giantswarm/backstage-plugin-kubernetes-react`. When Create fails, the template wizard keeps the entries, disables Create while a submit is under way, and shows on the review step an alert that tells an expired session from a declined sign-in.
