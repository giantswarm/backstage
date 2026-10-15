---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-analytics-react': minor
'@giantswarm/backstage-plugin-ui-react': minor
---

A workflow's page has a Run it tab (`/agent-platform/workflows/<name>/run`),
after Overview, that runs the workflow as a tool's page runs a tool: the input
form from the workflow's input schema, the Run button with its note ("Runs as
you.", "Nothing is changed."), and the result. Connectors its steps call that
wait for the person's sign-in are named above the form. Without a muster
session, on an installation without per-user muster sessions, or where muster
lists no `workflow_<name>` tool for the person, the tab says why instead of
showing a form. A run refreshes that workflow's run records. While a run is in
flight, leaving the tab (another tab, a link, a reload) asks first and says
that muster finishes the run anyway. The page's "Only reads" badge is now read
off the tool catalogue the page already loads.

The tool page and the Run it tab share `ToolRunPanel` and `useToolRun`, which
reports the new `Muster.workflowRan` event for any run of a workflow's tool.
`ShellPage` and `RouteTabs` take `onTabNavigate` / `onNavigate`, to hold a tab
switch until the page agrees.
