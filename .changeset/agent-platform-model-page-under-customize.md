---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

A model's page moves to `/customize/models/<installation>/<namespace>/<name>`,
beside Customize → Models; the former `/agent-platform/models/…` address
redirects there. The page gains the agent page's **Technical details**
fold-out (GitOps source, the ModelConfig's name and key Secret, and the
controller's conditions with reason and message), open on arrival while the
model is not accepted; the technical name moves there from beside the title.
Customize → Models shows why a model is **Not accepted** or **Pending** in a
hint beside its status (for an unreconciled change, that it is not reconciled
yet). The agent page links the ModelConfig to the model's page where it could
be read. The model page's spend-per-day chart draws no legend
(`CostPerDayCard` gains `showLegend`). The plugin gains a `customize` external
route, which the app binds to its Customize page. `ModelConfig` gains
`getConditions()` and `isStale()`, and `isModelConfigStatusStale` and
`MODEL_CONFIG_CONDITION_ORDER` are exported.
