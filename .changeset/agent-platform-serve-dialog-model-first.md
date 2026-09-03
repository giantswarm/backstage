---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The Serve dialog starts from the model. Its first field lists what can be
served on the installation: every curated preset — "cached on <node>" when a
cache directory holds its weights (model-manager's attribution, or the same
Hugging Face repository), else "downloads from Hugging Face" — and the cache
directories no preset claims. The preset is derived from the model; a cached
entry serves from the cache under the directory's name, pinned to its node,
with the directory's own source (`hf://<repository>` under the cache redirect
policy, `pvc://<claim>/<dir>` otherwise or when the repository is not
recorded) — never another model's `hf://`. A directory without a preset asks
for one explicitly, warns that the recipe was written for another model and
requires that to be acknowledged before serving, like the does-not-fit
verdict. The separate Preset and Weights fields are gone.
