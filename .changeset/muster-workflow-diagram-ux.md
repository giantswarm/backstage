---
'@giantswarm/backstage-plugin-muster': minor
---

The shell's workflow page: the flow diagram can go full screen over the content area, the nav rail staying beside it ("Full screen"; Escape or "Exit full screen" brings it back), and a step's details open inside its box in the diagram instead of under it — one step at a time, the layout moving what follows down to make room. The workflow's description moves from the header into the content, so the header's actions sit beside the title as on the other detail pages. The page shows an action another plugin attaches to `sub-page:muster/workflows` (input `editAction`, reading the workflow with the new `useWorkflowPageTarget`), and the Customize Workflows panel takes a `createAssist` for the way to create one.
