---
'@giantswarm/backstage-plugin-gs-node': patch
---

`MusterMcpClient.callTool` answers a wrapped tool's `structuredContent` where its text block is prose, not JSON (mcp-go's `NewToolResultStructured`), instead of dropping the data for the prose. A JSON text block still wins, so every tool that answers JSON text is unchanged.
