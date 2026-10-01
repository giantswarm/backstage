---
'@giantswarm/backstage-plugin-muster': minor
---

A workflow's page has the tabs Overview (the index) and Run (`…/run`). Run is the tool page's argument form and result view for the workflow's `workflow_<name>` tool, so a workflow is run on its own page instead of on muster's tool page in the MCP Servers tab. Above the form, Run names the servers the workflow's steps call that wait for the user's sign-in, each with its Sign in. The execution history and step results the page used to show at its foot are removed. The page gets breadcrumbs back to the Workflows list, and a workflow the installation doesn't have shows an empty state that links back to the list.

A manually added workflow's Edit and Delete move to the page header, and the provenance badges next to the workflow's name are gone. In the Workflows table, Available and Source read as plain text with an icon (the GitOps cog for GitOps) instead of pills. Workflow durations are shown in whole milliseconds.
