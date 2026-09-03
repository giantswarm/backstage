---
'@giantswarm/backstage-plugin-muster': patch
---

MCP servers page: rename the lifecycle actions to what muster actually does
with a remote server — Activate/Deactivate (one shown at a time, keyed on
`spec.suspended`) and Reconnect (hidden while suspended) — and say so in the
confirm dialogs.
