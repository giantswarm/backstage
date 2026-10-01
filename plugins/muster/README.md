# @giantswarm/backstage-plugin-muster

Frontend plugin (`pluginId: muster`) for
[muster](https://github.com/giantswarm/muster): the MCP servers it aggregates,
their tools, and its workflows, as the Agent Platform's MCP Servers and
Workflows tabs.

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
- **Workflow page** (`/agent-platform/workflows/:name`): the workflow's state,
  description and edit/delete actions over two tabs:
  - **Overview** (the index): validation warnings, run statistics, arguments,
    the numbered steps and the workflows calling this one.
  - **Run** (`…/run`): the tool page's argument form and result view for the
    workflow's `workflow_<name>` tool.

## Backend

Data comes from the `muster` backend plugin
(`@giantswarm/backstage-plugin-muster-backend`), a thin REST proxy over the
muster MCP server's `core_workflow_*` tools. See that plugin's README for
configuration (it reuses the `aiChat.mcp` entry named `muster`).
