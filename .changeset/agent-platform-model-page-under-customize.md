---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

A model's page moves to `/customize/models/<installation>/<namespace>/<name>`,
beside Customize → Models; the former `/agent-platform/models/…` address
redirects there. The page gains the agent page's **Technical details**
fold-out (GitOps source, the ModelConfig and its key Secret, and the
controller's conditions with reason and message), open on arrival while the
model is not accepted. Customize → Models shows why a model is **Not
accepted** or **Pending** in a hint beside its status (for an unreconciled
change, that it is not reconciled yet). The agent page links
the ModelConfig under Technical details to the model's page. The spend-per-day
chart draws no legend for a single model. The plugin gains a `customize`
external route, which the app binds to its Customize page. `ModelConfig`
gains `getConditions()` and `isStale()`, and `isModelConfigStatusStale` and
`MODEL_CONFIG_CONDITION_ORDER` are exported.
