---
'@giantswarm/backstage-plugin-gs': patch
---

Migrate scaffolder field schemas from deprecated `makeFieldSchemaFromZod` to `makeFieldSchema`, removing direct zod dependency and fixing TypeScript OOM without needing a zod version resolution.
