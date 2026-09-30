---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-gs': patch
---

Only offer an installation selection when there is an actual choice.

- `agent-platform`: when several installations are configured but, once the
  fleet has settled, only one of them is usable (has models and agent-manager),
  the "Create an agent" installation card selects it and says where the agent
  runs instead of offering a one-option dropdown. The card now also explains
  installations whose muster server list couldn't be read and installations
  whose cluster access isn't healthy, instead of leaving them out silently.
- `gs`: the `GSInstallationPicker` scaffolder field selects the only selectable
  installation, regardless of `autoSelectFirstValue`, and hides itself when it
  is the only allowed one. It waits for the installations' health checks before
  deciding, withdraws a selection that becomes disabled, and withdraws an
  automatic pick when the list widens again.

`muster`: remove the "Add ad-hoc server" button and its create dialog from the
MCP Servers page. "Register server" is now the single way to add an MCP server.
stdio servers and non-default settings (`autoStart` off, a custom timeout, and
so on) are no longer created from the portal; add those through GitOps. An
existing server's settings can still be changed through its JSON edit dialog.
User-facing copy no longer calls these servers "ad-hoc".
