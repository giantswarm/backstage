---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

MCP server and workflow editing share one definition-editor dialog: the same dismiss lock while a validate or save is in flight, error display and seeding on open, with the server's JSON editor and the workflow's YAML editor. The session rename dialog seeds through `useOnDialogOpen`.
