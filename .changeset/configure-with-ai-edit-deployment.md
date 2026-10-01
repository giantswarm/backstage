---
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-ai-chat-backend': minor
---

The "Configure with AI" scaffolder step option (`configureWithAi`) accepts `mode: edit` with `deploymentName`/`deploymentNameField` and `deploymentNamespace`/`deploymentNamespaceField`, for the Edit App Deployment template. In edit mode the assistant is asked to read the HelmRelease's inline values and referenced ConfigMaps and suggest changes per value source; Secrets are referred to by name only, and confidential changes are given as keys to merge into the existing Secret values. Details without a value are no longer printed as `undefined` in the prompt.
