---
'@giantswarm/backstage-plugin-muster-backend': patch
---

`/usage` takes `stepHours` (1 or 24, `hours` a multiple of it) to choose the bucket size; with 24 the window ends at the next UTC midnight, so `hours=24*n` covers the last `n` UTC days. Every rollup now counts only the samples inside the window: the evaluation at the window's start, which covers the step before it, is no longer added to the totals, the per-tool and the per-server calls.
