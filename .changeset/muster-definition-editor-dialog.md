---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

MCP server and workflow editing share one definition-editor dialog: the same dismiss lock while a validate or save is in flight, error display and seeding on open, with the server's JSON editor and the workflow's YAML editor. A definition that no longer parses clears the previous success message, and only a parse error marks the editor invalid (the server's JSON editor too), not a failed call. `ConfirmDialog`, the definition-editor dialog and the session rename dialog share one busy dismiss lock (now `ui-react`'s `BusyDialog`), and the rename dialog seeds through `useOnDialogOpen`.
