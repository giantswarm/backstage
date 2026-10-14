---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Model hosting's create flows are pages of their own instead of dialogs over
the list, in the same frame as agent creation: Serve model, Import from
Hugging Face and Pull model (`/agent-platform/models/serving/serve`,
`…/import`, `…/pull`), Add model backend (`…/serving/add-backend`, Backend and
Review steps) and Add GPU node pool (`…/capacity/add-pool`, Pool and Review
steps). Each has a deep-linkable URL; Serve model takes its seed from the
query, and the older `?serve=1` pool link still opens it. Cancel returns to the
view the flow was opened from; a served model lands on Running models with its
steps open, a deployed pool on GPU pools with its lifecycle open. The hosting
area's copy is condensed into full sentences.
