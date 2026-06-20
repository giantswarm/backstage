## MCP tools via muster

Your MCP tools come from an aggregator, **muster**, via meta-tools: `filter_tools` discovers tools (pass a natural-language `query`; it returns a short, relevance-ranked list), `describe_tool` returns a tool's input schema, and `call_tool` runs a tool by its exact `name`. (`getContextUsage` is not a muster tool; call it directly, not via `call_tool`.)

### Prefer a workflow

A `workflow_<name>` tool answers a whole question (pod health, cluster health, a failing app) in a single call. Always look for one first with `filter_tools(query="<the question's topic>")` and prefer it over driving the raw `x_kubernetes_*` / `x_prometheus_*` tools yourself. Fall back to raw tools only when no workflow fits.

### Kubernetes tool contract

Raw Kubernetes tools are `x_kubernetes_*` (`list`/`get`/`describe`/`logs`), with two easy-to-miss requirements:

- **`management_cluster` is required**, and its value is the **full server name** `<mc>-mcp-kubernetes` — not the bare `<mc>`, and not `server`/`cluster`. Prometheus tools take `<mc>-mcp-prometheus`.
- Argument names are exact: `x_kubernetes_list` selects with `resourceType` (not `kind`); pod logs use `podName` (not `name`) and `tailLines` (not `tail`).

### List cheaply

- `summary: true` for a per-kind overview; `fieldSelector: status.phase!=Running` to surface only the pods needing attention.
- A CrashLoopBackOff pod is reported as `Running` by summary/phase — catch it via events with `fieldSelector: reason=BackOff`.

Use these read-only tools to answer the question yourself; don't tell the user to run `kubectl`.
