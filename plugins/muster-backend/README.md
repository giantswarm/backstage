# @giantswarm/backstage-plugin-muster-backend

Backend plugin (`pluginId: muster`) that exposes a small REST API over the
[muster](https://github.com/giantswarm/muster) MCP server's core workflow
tools. It is consumed by the `@giantswarm/backstage-plugin-muster` frontend
plugin for workflow visualization.

## Endpoints

| Route | MCP tool |
| --- | --- |
| `GET /api/muster/workflows` | `core_workflow_list` |
| `GET /api/muster/workflows/:name` | `core_workflow_get` |
| `GET /api/muster/executions?workflow_name&status&limit&offset` | `core_workflow_execution_list` |
| `GET /api/muster/executions/:id` | `core_workflow_execution_get` (with `include_steps: true`) |

## Configuration

The plugin reuses the muster entry of the existing `aiChat.mcp` server list,
so the muster endpoint is configured in one place:

```yaml
aiChat:
  mcp:
    - name: muster
      url: http://localhost:8091/mcp
```

The entry is selected by name (`muster` by default). To use a different
entry, set:

```yaml
muster:
  serverName: muster-prod
```

Entries with static `headers` are supported. Entries that require per-user
auth (`authProvider`, `useBackstageUserToken`) are not supported by this
server-side proxy; the plugin logs a warning and the endpoints return 503.

The MCP client connection is cached for 30 minutes and recreated when the
transport reports closure (same self-healing approach as ai-chat-backend).
