---
'@giantswarm/backstage-plugin-agent-platform': minor
---

A namespace's default model is only the ModelConfig annotated `agent-platform.giantswarm.io/is-default-model-config: "true"`. An unmarked `default-model-config` is no longer the default, so Connect a model makes the new model the default when nothing else is marked, as agent-manager now resolves it. A default that Helm values set points to that release's values instead of the removed `kagent.modelConfigs[].default`.
