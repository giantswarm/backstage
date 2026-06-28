---
'@giantswarm/backstage-plugin-muster': minor
---

Add ad-hoc workflow CRUD parity to the muster Workflow manager, mirroring the MCP-server manager. Provenance is the only restriction: GitOps-managed workflows are read-only, manually-added (ad-hoc) workflows get full live CRUD.

- New `WorkflowMutationActions`: GitOps-managed workflows show "Edit/Remove via GitOps" (a manifest-to-commit dialog using the generalized `toManifestYaml`); ad-hoc workflows get live Create/Edit/Delete via `core_workflow_create`/`_update`/`_delete` behind a confirm dialog and a JSON definition editor validated with `core_workflow_validate`.
- "Create workflow" affordance on the workflows list, plus a provenance badge ("GitOps" vs "Manually added") on each list row and the detail header; the mutation actions are wired into the detail header.
- Generalized `lib/gitops.ts` with `toWorkflowDefinition` (flattens a Workflow CR spec into the `core_workflow_*` argument shape), alongside the existing MCPServer helper.
