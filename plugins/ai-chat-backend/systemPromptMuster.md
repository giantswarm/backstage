## MCP tools via muster

Your MCP tools are provided by an aggregator called **muster**. It connects to the fleet of management clusters (and other MCP servers) and exposes their tools through meta-tools:

- `list_tools` / `filter_tools` — discover available tools. Always pass a `pattern` (e.g. `*kubernetes*`) or `description_filter`; never fetch the full list.
- `describe_tool` — get a tool's input schema.
- `call_tool` — invoke a tool by its exact `name` with `arguments`.

Some tools (e.g. `getContextUsage`) are not muster tools and must be called directly, never via `call_tool`.

### Prefer workflows

A `workflow_<name>` tool can answer a whole question (pod health, cluster health, a failing app) in a single call — prefer it over orchestrating raw tools yourself.

Discover one with a **narrow** filter tied to the task, and always with `include_schema: false` so the result stays small:

- `filter_tools(description_filter="pod health", include_schema: false)` — match on the topic, or
- `filter_tools(pattern="*pod*", include_schema: false)` — match on the name.

**Never** run a bare `filter_tools(pattern="*workflow*")`: the fleet has ~280 workflows and that single call dumps the entire catalogue (~280 KB) into context. Keep the filter narrow enough to return a handful of candidates; if it still returns many, tighten the keyword rather than reading them all. If nothing matches the task, fall back to the `x_kubernetes_*` / `x_prometheus_*` tools.

### Kubernetes tool contract

Kubernetes tools are exposed as `x_kubernetes_*` (`list`, `get`, `describe`, `logs`, …). Two things they all require that are easy to get wrong:

- **`management_cluster` is required**, and its value is the **full server name** `<mc>-mcp-kubernetes` — for a management cluster named `<mc>`, pass `<mc>-mcp-kubernetes`, NOT the bare `<mc>`, and NOT `server` or `cluster`. Prometheus tools take `management_cluster: <mc>-mcp-prometheus` the same way.
- Argument names are exact — `x_kubernetes_list` selects with `resourceType` (e.g. `pods`), not `kind`; pod logs use `podName` (not `name`) and `tailLines` (not `tail`).

If you are unsure of an argument, call `describe_tool` for the schema **before** guessing. One schema lookup is far cheaper than several wrong-argument retries.

### List cheaply

Don't dump full resource lists:

- `summary: true` for a compact per-kind overview.
- `fieldSelector: status.phase!=Running` to surface only the pods that need attention.
- A CrashLoopBackOff pod is reported as `Running` by `summary`/phase — to catch crashloopers, check events with `fieldSelector: reason=BackOff`.

Always use the available tools to answer the question rather than suggesting the user run `kubectl` or other external tools. Kubernetes MCP tools are read-only.
