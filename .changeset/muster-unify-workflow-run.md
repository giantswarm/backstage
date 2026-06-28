---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': minor
---

Unify workflow execution with the tool explorer. Running a workflow is just executing its `workflow_<name>` aggregated tool, so the bespoke run dialog is removed in favour of a single execution surface.

- The workflow detail "Run" button and the workflow list "Run workflow…" action now navigate to the tool explorer with the `workflow_<name>` tool preselected (`?installation=<inst>&tool=workflow_<name>`) and its argument form ready.
- The tool explorer honours `?tool=` (preselects the tool) and `?server=` (seeds the browse search) deep links.
- Removed the `RunWorkflowDialog` component, the `?run=1` auto-open, the `runWorkflow` client method, and the backend `POST /workflows/:name/run` route.
