---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Serve dialog: a **Placement** choice where model-manager recommends one (model-manager's split placement) — "Split across A and B", one model tensor parallel over the nodes' fast link, or "One copy on A". The recommendation is preselected and marked; split is disabled with model-manager's reason when no fast-linked nodes host the model; the fit verdict is the chosen placement's ("Fits — split across A and B (fast link sparks)"), and Serve sends `placement` and `nodes` with `load_model`. The Serving list shows a split model's nodes in the Node column, marked "split". Nothing changes against a model-manager without placements.
