---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Compact per-backend layout for the served-models table on the Serving view.
The table is grouped by installation (and backend), each group under a header
carrying what every row of it shares — backend and runtime version, and the
endpoint they all answer on with a copy action — and each group's columns
follow its own rows: Node and GPUs appear only where a row is placed on a
node (never from an installation's `nodeInventory` capability), Model only
where the weights come from somewhere other than the served name, Runtime
only where a group's rows run on more than one. Memory merged into the status
cell (`Ready` / `5.4 GiB in memory · evicts 22:58`, `Available` / `Not
loaded`), size and model details moved under the name, features became chips
for what matters to agents (tools, vision, thinking, embedding) with the
tool-calling gap as a warning icon, and the Endpoint and Installation columns
left the grid. An Ollama installation next to a KServe one now shows what it
knows and no dashes for what it does not; KServe rows keep node, GPUs, preset
and cache.
