---
'app': patch
---

Fix deprecation warning for the user settings General sub-page by migrating
from the deprecated `config.schema` option to the new top-level `configSchema`
option using a Standard Schema value from `zod` v4. Adds `zod@^4.3.6` as a
direct dependency of `packages/app` so the schema resolves against a Zod
build that includes JSON Schema conversion (the `zod/v4` subpath of Zod v3
does not).
