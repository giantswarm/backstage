# @giantswarm/backstage-plugin-muster

## 0.1.0

### Minor Changes

- 41a2afb: Add muster workflow visualization: a new `muster` frontend plugin renders
  workflow definitions as flow diagrams (one node per step, dashed condition
  edges) with execution history and live per-step status overlay, backed by a
  new `muster-backend` plugin that proxies the muster MCP server's
  `core_workflow_*` tools over REST (reusing the `aiChat.mcp` entry named
  `muster`).
