---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The GPU capacity view explains a memory budget the operator set: a host node
whose serving layer reports `budgetSource: override` (model-manager's
`ollama.memoryBudgetGiB`, for a pod whose `/proc/meminfo` is not the host's
memory) says so in the budget cell's tooltip and keeps its "Backend host"
rendering — no GPU columns, the operator's figure as the budget.
