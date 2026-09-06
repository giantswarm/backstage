---
'@giantswarm/backstage-plugin-gs': patch
---

Revert `@apidevtools/json-schema-ref-parser` to v15. v16 resolves remote
`$ref`s through Node-only dynamic imports (`undici`, `node:dns/promises`) that
the frontend bundle cannot resolve, which failed the app build on every commit
since the bump.
