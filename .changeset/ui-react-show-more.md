---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

Move `ShowMore` (with `revealAll`) and the list-scale constants `INITIAL_ROWS`,
`SEARCH_MIN` and `USED_BY_ROWS`, plus the `countNoun` helper, from the Agent
Platform plugin into `@giantswarm/backstage-plugin-ui-react`, so the muster
plugin can window its long lists too (it cannot import from agent-platform,
which depends on it). agent-platform re-exports them for its existing imports;
behaviour is unchanged.

Also adds `searchableIf(options)`: whether a `Select` over these options should
offer type-ahead (more than `SEARCH_MIN` options).
