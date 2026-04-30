---
'backend': patch
---

Remove `@terasky/backstage-plugin-catalog-mcp-backend` in favor of the built-in `catalog.query-catalog-entities` action from `@backstage/plugin-mcp-actions-backend`. The built-in action covers all `catalog-mcp.*` use cases via predicate filters, logical operators (`$all`, `$any`, `$not`), value operators (`$in`, `$exists`, `$contains`, `$hasPrefix`), field selection, sorting, and pagination.
