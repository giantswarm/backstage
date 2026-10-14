---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': minor
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

A workflow's page is one column of three tabs, each its own address. Overview
says what the workflow is for under a "What it's for" heading, when it was
created, what it needs and how it runs. Usage holds its run statistics. Details
lists where it comes from, its tool name, the connectors it uses and the
workflows that call it, then a Technical details fold-out with the CR's
namespace, labels and referenced tools. The ⋮ menu's "View manifest" shows the
Workflow CR as YAML with a copy button, for every workflow, beside "Edit in
Git…" for one Flux reconciles. The facts column and the "Advanced" disclosure
are gone, and so is muster-backend's unused `GET /workflows/:name` route.

`ui-react` gains `PageSection`, the heading-and-content section of a detail
page tab that the agent, skill and workflow pages now share, and a `compact`
option on `SectionHeader`.
