---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Host memory budget and GPU share for Ollama installations on the Models tab.
The GPU capacity view renders the host node an Ollama-backed model-manager
reports (`budgetSource: host-meminfo`, model-manager 0.7+): the host's memory
as the model-manager pod sees it as the budget, what the loaded models take of
it as reserved, what is free, and an `accelerated` marker when a loaded model
sits on the GPU — with no GPU product, count or device-plugin figure, which
Ollama's API does not expose (a fleet of such hosts shows no GPU columns at
all; next to a KServe node the host row reads "—" with what it is on hover,
never "unknown"). The memory budget cell now shows the reservation in text
for every node. On the Serving view a loaded model's memory line carries the
share of its footprint on the accelerator, from `running.vramBytes` —
`5.4 GiB in memory · 100 % GPU · evicts 22:58`, `CPU` when none of it is
there, a percentage in between — and explains on hover that the footprint is
the weights plus the KV cache for the loaded context length. An older
model-manager (no `vramBytes`, no Ollama node inventory) keeps today's line
and the view's empty state; Ollama rows still show no Node or GPUs column.
