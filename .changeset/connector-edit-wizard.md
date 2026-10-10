---
'@giantswarm/backstage-plugin-muster': minor
---

Edit a connector in the agent-platform shell through the connector wizard,
pre-filled, the way agents and skills are edited.

The shell's connector page drops its Settings tab: Edit opens the wizard on
the connector (`new?edit=<name>`), whose "Save changes" updates it through the
same muster update and telemetry the tab used, with the same per-field
validation as adding one. Close, Cancel and Done of an edit return to the
connector's page. The tab's old address redirects to that edit, a family's
instances moved to their own Instances tab, and "Edit in Git…" (for a
connector applied from Git) and "Edit as JSON…" (for one the wizard cannot
represent) moved into the page's menu.

Edit and the menu now sit in the same place for every connector, whatever its
sign-in state: where Edit cannot be used — the connector is managed by GitOps,
it is a family, the muster session is not connected, or the wizard cannot
represent it — it stays, disabled, with a tooltip saying why. Signing in to a
connector is offered in the Tools tab, where its absence hides the tools. The
classic MCP server pages are unchanged.
