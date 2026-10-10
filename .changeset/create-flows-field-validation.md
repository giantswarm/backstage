---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

A blocked Continue or submit in the create flows (new agent, add connector, add skill and edit skill, add model) now marks the fields that are wrong: a danger edge on the field, the reason right under it (tied to it with `aria-invalid` and `aria-describedby`), and the keyboard focus on the first one. The generic "Please fix the following" box is gone, except for the few problems no field on the step can show. Add skill no longer greys out its button while fields are missing; pressing it shows which ones.

`ui-react` adds the shared mechanism: `useFieldValidation`, `fieldErrorProps` for bui text fields, `useSelectFieldError` for bui `Select`, `FieldErrorText` for hand-rolled fields, and an optional `describedBy` on `SelectableCardGrid`.
