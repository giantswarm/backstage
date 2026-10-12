---
'@giantswarm/backstage-plugin-gs-node': patch
'@giantswarm/backstage-plugin-muster-backend': patch
---

`MusterMcpClient.callTool` answers a wrapped tool's object `structuredContent` wherever the tool answers one, and its text (parsed as JSON where it is JSON) otherwise. MCP makes `structuredContent` the machine-readable result and the text its rendering: a tool that answers `NewToolResultStructured(data, "3 workspaces")`, a JSON scalar as its text, or no text block at all now reaches `/call` as its data instead of the prose, `3` or an empty body. Tools that answer the same JSON as text and `structuredContent` (muster's own) are unchanged. The Tool explorer, which reads `/call`, shows such a tool's data instead of its prose: for `core_auth_login` the `{authUrl, clientIdMethod}` instead of the sign-in instructions; the server sign-in itself reads both through `callToolWithStructured`. The MCP usage route refuses a prometheus answer that is structured data instead of the text it parses, naming the tool, instead of reading it as zero calls.
