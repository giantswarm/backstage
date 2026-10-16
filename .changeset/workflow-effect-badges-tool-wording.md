---
'@giantswarm/backstage-plugin-muster': patch
---

Workflows say what they do in the same words and badges as tools: "Reads" and "Changes things" instead of "Only reads" and "Can change things", in the Workflows list (table and phone rows), on a workflow's page and in its steps' spoken names. A workflow still shows "Reads" only when muster marks it read-only, which it does only when every tool its steps can reach is. `EffectBadge` loses its `subject` prop, which only chose the workflow wording.
