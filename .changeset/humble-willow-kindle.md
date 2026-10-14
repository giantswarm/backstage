---
'@giantswarm/backstage-plugin-muster-backend': minor
---

`/usage` takes `window=month` in place of `hours`: the UTC calendar month so far by the backend's clock, in daily steps. A daily window now ends after today also at exactly midnight. Every rollup counts only the samples inside the window: the evaluation at the window's start, which covers the step before it, is no longer added to the totals, the per-tool and the per-server calls.
