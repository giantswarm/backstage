---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

A workflow's page has a Run it tab (`/agent-platform/workflows/<name>/run`),
after Overview, that runs the workflow as a tool's page runs a tool: the input
form from the workflow's input schema, the Run button with its note ("Runs as
you.", "Nothing is changed."), and the result. Connectors its steps call that
wait for the person's sign-in are named above the form. Without a muster
session the tab asks for one, and where muster lists no `workflow_<name>` tool
for the person it says so instead of showing a form. A run refreshes the
workflow's run statistics. The page's "Only reads" badge is now read off
muster's tool list, so a workflow muster does not offer no longer fails a
request.

The tool page and the Run it tab share `ToolRunPanel`. A run from the tab
reports the new `Muster.workflowRan` event.
