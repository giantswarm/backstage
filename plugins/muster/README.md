# @giantswarm/backstage-plugin-muster

Frontend plugin (`pluginId: muster`) that visualizes
[muster](https://github.com/giantswarm/muster) workflows as flow diagrams,
including execution history with live per-step status.

## Features

- **MCP servers** (`/agent-platform/mcp-servers`, the Agent Platform's MCP
  Servers tab): one table of the
  installation's servers -- a server family one row, muster itself one row --
  searchable by server and tool name (`?q=`).
- **Server page** (`/agent-platform/mcp-servers/:server?installation=…`):
  one page per MCP server, server family or muster itself (`muster`), with
  the tabs Tools (the page's index), Resources, Prompts, -- for a family --
  Instances, and Overview, and the server's actions in the page header.
- **Tool page** (`/agent-platform/mcp-servers/:server/tools/:tool`): a
  tool's description, markers and input schema, and a typed form to run it.
- **Workflows list** (`/agent-platform/workflows`, the Agent Platform's
  Workflows tab): all workflows known
  to the connected muster instance with description and availability.
- **Workflow detail** (`/agent-platform/workflows/:name`): the workflow definition
  rendered as a vertical flow diagram (one node per step, dashed side edges
  for `condition.from_step` dependencies) built on
  [`@xyflow/react`](https://reactflow.dev/).
- **Execution overlay**: selecting an execution from the history panel
  colors each step by status (completed / failed / skipped / in progress /
  pending), animates the edge into the currently running step, and polls
  every few seconds while the execution is in progress.
- **Step detail drawer**: clicking a node shows the step definition
  (tool, templated args, condition) and -- with an execution selected --
  the resolved input, result/error payloads, and timing.

## Backend

Data comes from the `muster` backend plugin
(`@giantswarm/backstage-plugin-muster-backend`), a thin REST proxy over the
muster MCP server's `core_workflow_*` tools. See that plugin's README for
configuration (it reuses the `aiChat.mcp` entry named `muster`).
