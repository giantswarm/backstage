---
'@giantswarm/backstage-plugin-agent-platform': minor
---

**Serve model** on an installation with model-manager goes through model-manager as the signed-in person. The dialog lists the presets model-manager publishes for the cluster (or, on a host backend, the cached models), shows `check_fit`'s verdict for the chosen preset before the button — whether it fits, the instance type the node comes as, whether the weights are cached, or the reason a preset no size of the pool hosts cannot be served — and serves with one `load_model` over muster: model-manager composes the serving object (an `LLMInferenceService` on a GPU pool), and the toast names it, the fit it was judged by and the first step of the timeline. The client-side `InferenceService` composition remains only for installations without model-manager. The Serving page opens the dialog on a pool when the route carries `serve=1&installation=…&cluster=…&pool=…`, installation, cluster and pool preselected.
