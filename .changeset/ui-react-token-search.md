---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-muster': patch
---

Extract muster's client-side token-boundary search matching (`tokenize`/`matchesQuery`,
previously a muster-local `lib/workflowSearch.ts`) into
`@giantswarm/backstage-plugin-ui-react` so other plugins can reuse it for
quick-search over an already-loaded list, without a backend ranking endpoint.
The Workflows table's quick-search now imports it from `ui-react`; behavior is
unchanged.
