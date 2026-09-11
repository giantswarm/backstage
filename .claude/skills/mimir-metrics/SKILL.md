---
name: mimir-metrics
description: Querying Prometheus/Mimir metrics and registering new metrics in the central metrics registry.
---

## Metrics Registry

All Prometheus/Mimir metrics the application queries are registered in a central file:

```
plugins/gs/src/apis/mimir/metrics.ts
```

Every metric used in a PromQL query **must** be defined here. This ensures a single place to see which metrics the application depends on.

### Defining a New Metric

Add a new exported constant using PascalCase, with `as const satisfies PrometheusMetric`:

```typescript
export const MyNewMetric = {
  name: 'my_new_metric_name',
  description: 'What this metric measures.',
  type: 'gauge', // 'counter' | 'gauge' | 'histogram' | 'summary'
  source: 'exporter-name', // e.g. 'cAdvisor', 'kube-state-metrics'
} as const satisfies PrometheusMetric;
```

Then add it to the `MetricsRegistry` array in the same file.

### Using Metrics in Queries

Import the metric constant and reference its `.name` property in PromQL strings:

```typescript
import { MyNewMetric } from '../../apis/mimir/metrics';

const query = `sum(rate(${MyNewMetric.name}{namespace="${ns}"}[5m]))`;
```

Never use raw metric name strings in queries — always go through the registry.

## Mimir Query Architecture

### Frontend

- **`useMimirQuery` hook** (`plugins/gs/src/components/hooks/useMimirQuery.ts`) — generic hook for executing a single PromQL **instant** query against Mimir via `@tanstack/react-query` (30s stale time). Requires an `installationName` and obtains an OIDC token from the Kubernetes auth provider.
- **`useMimirRangeQuery` hook** (`plugins/gs/src/components/hooks/useMimirRangeQuery.ts`) — the same, for a **range** query: a series over time. Takes `start`/`end` (Unix seconds) and `step` in addition to the query. **They are part of the query key, so they must be stable across renders** — a caller passing `Date.now()` re-keys every render and refetches forever. Snap the window to a boundary and memoise it; `dailyRangeWindow` in `plugins/agent-platform/src/lib/llmUsageQueries.ts` is the worked example (UTC midnights, stable for a day). Alignment is the caller's job because it decides what a bucket *means*: a boundary at midnight measures calendar days, one at an arbitrary clock time measures rolling ones.
- **`useMimirAvailable` hook** — the `gs.installations.<name>.mimirEnabled` gate. Both query hooks apply it themselves; it returns `undefined` while the installations config is still loading, which both hooks report as `isLoading` so a caller does not flash an empty state.
- **`sanitizePromQLValue`** (`plugins/gs/src/components/hooks/promql.ts`) — strip `"`, `}`, `\` and newlines from any label-matcher value derived from user input, a route parameter or an API response.
- **`useMimirResourceUsage` hook** (`plugins/gs/src/components/hooks/useMimirResourceUsage.ts`) — higher-level hook that composes four `useMimirQuery` calls to fetch CPU usage, memory usage, resource requests, and resource limits for a deployment.
- **`MimirClient`** (`plugins/gs/src/apis/mimir/MimirClient.ts`) — API client implementing `MimirApi`. Sends `GET` requests to the backend at `/mimir/query` and `/mimir/query_range` with the OIDC token in the `X-Mimir-Token` header (not `Authorization`, which on that hop carries the Backstage identity).
- **`MimirApi` / `mimirApiRef`** (`plugins/gs/src/apis/mimir/types.ts`) — API interface and ref (ID: `plugin.gs.mimir`).

### Backend

- **`MimirService`** (`plugins/gs-backend/src/services/MimirService.ts`) — `query()` and `queryRange()`, both over one private `fetchPrometheus()`: it looks up the installation's `baseDomain` from config, constructs the Mimir URL (`https://observability.${baseDomain}/prometheus/api/v1/<query|query_range>`), forwards the OIDC token as `Authorization: Bearer`, and sets `X-Scope-OrgID: giantswarm`. Refuses an installation with `mimirEnabled: false` (`NotFoundError`) or no `baseDomain`; maps 401/403 and a `400 + text/html` gateway rejection to `AuthenticationError`, everything else to `ServiceUnavailableError`.
- **Routes** (`plugins/gs-backend/src/router.ts`) — `GET /mimir/query` and `GET /mimir/query_range` validate their parameters and the `X-Mimir-Token` header via Zod, then delegate. Both raise `InputError` (400) on a bad request rather than a 5xx, because `MiddlewareFactory.error()` forwards anything >= 500 to Sentry.

Range queries pass `start`/`end`/`step` through to Mimir verbatim — it owns what a legal timestamp and step are, and duplicating its grammar in the Zod schema would only reject ranges it accepts. Mimir refuses a range exceeding its point limit (11k per series by default); that surfaces as `ServiceUnavailableError` carrying its message.

### Adding a New Query Hook

1. Register any new metrics in `metrics.ts` (see above).
2. Create a new hook file in `plugins/gs/src/components/hooks/` (e.g. `useMimirMyData.ts`).
3. Use `useMimirQuery` / `useMimirRangeQuery` for each PromQL query, referencing metric names from the registry.
4. Use `extractScalar` / `extractScalarByResource` patterns from `useMimirResourceUsage.ts` for parsing responses.

Compose a **fixed list** of hook calls, written out one at a time, as
`useMimirResourceUsage` does for its four and `useLlmUsage`
(`plugins/agent-platform/src/hooks/useLlmUsage.ts`) does for its nine — not a
loop, and not a local helper that calls a hook: `react-hooks/rules-of-hooks`
cannot verify either, and the fixed order is the whole contract. Reach for
`useQueries` only when the query list is genuinely dynamic, the way
`useMimirWorkloads` fans out over installations.

Prefer **one query with a wider `sum by (…)`** over several narrow ones and
reduce it client-side. `useLlmUsage` gets its totals, its per-agent breakdown,
its per-model breakdown and its token-type split out of two queries that way —
and those four views cannot disagree with each other, because they are
reductions of the same numbers.

### Parsing: be total, and keep zero distinct from nothing

Sample values arrive as **strings**, and include `NaN`, `+Inf` and `-Inf` —
`Number()` produces all three happily and any of them poisons a running total.
Only a finite number counts; skip the rest rather than throwing, so one odd
series does not blank a page. `histogram_quantile` over a histogram with no
observations *is* `NaN`, which is the normal answer on an idle installation.

And where a metric is only recorded under some condition, `0` and "no series at
all" are different facts and must stay different. agentgateway records no cost
for a model missing from its price catalogue, so a `?? 0` there turns "we
cannot price this" into a confident `$0.00`. See `optionalTotal` in
`plugins/agent-platform/src/lib/llmUsage.ts`.

### Charts

`plugins/ui-react` has `StackedBarChart` (recharts) and, for a chart whose
series are identities rather than magnitudes, `assignSeriesColors` in
`utils/chartPalette.ts` — eight hues in a **fixed, validated order**. Re-ordering
it or substituting a hue breaks its colour-blindness guarantees silently;
re-validate first, and pool anything past the seventh identity into "Other"
rather than generating a ninth hue.
