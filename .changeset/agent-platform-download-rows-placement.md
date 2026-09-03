---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Download rows on the Serving view carry the pull's node and preset as
model-manager reports them on the job (model-manager 0.9: what the request
named, or the node it picked itself after the fit check), so a KServe download
sits in its node's place of the group's placement column and its description
says which preset it is for. Retry re-issues the pull with that preset and node,
so the retry lands in the same cache directory on the same node instead of
falling back to a directory named after the model on whichever node
model-manager picks; Ollama retries are unchanged.
