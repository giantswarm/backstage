---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': minor
---

Add a first-class muster management section. The muster plugin now exposes a tabbed page (Dashboard, MCP servers, Workflows, Tool explorer) over a two-client model: a read-only, multi-installation Kubernetes/CRD client (reusing the clusters-page `useResources` mechanism for `MCPServer` and `Workflow` CRs across every installation that runs a muster aggregator) and the muster MCP proxy for live execution.

- **Dashboard**: per-installation identity/health cards plus a fleet health matrix (`management-cluster` × `family`) built from MCPServer CRD status.
- **MCP servers**: CRD-driven list grouped by management cluster/family with an auth/token-chain detail view (`spec.auth`), runtime merge from `core_mcpserver_list`, and per-server tool listings.
- **Workflows**: CRD-driven list with step counts and validity, a step-card detail view with cross-workflow references, execution statistics, and a run + execution-history view via the MCP proxy.
- **Tool explorer**: unified browse/search over core, aggregated (`x_<server>_*`), and workflow tools via `filter_tools`, a JSON-schema-driven execution form (`describe_tool` + `call_tool`), and a result viewer.

The backend `MusterMcpClient` is generalised from the four hardcoded workflow tools to all muster meta-tools (`list_tools`, `filter_tools`, `describe_tool`, `list_core_tools`, `call_tool`) and made multi-installation (config-driven map keyed by installation, selected per request via `?installation=`). A config-driven read-only-by-default safety allowlist gates mutating `call_tool` invocations. The unused ReactFlow workflow-graph stack and its dependencies (`@xyflow/react`, `classnames`) are removed.
