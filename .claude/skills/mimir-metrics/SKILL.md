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

- **`useMimirQuery` hook** (`plugins/gs/src/components/hooks/useMimirQuery.ts`) — generic hook for executing a single PromQL instant query against Mimir via `@tanstack/react-query` (30s stale time). Requires an `installationName` and obtains an OIDC token from the Kubernetes auth provider.
- **`useMimirResourceUsage` hook** (`plugins/gs/src/components/hooks/useMimirResourceUsage.ts`) — higher-level hook that composes four `useMimirQuery` calls to fetch CPU usage, memory usage, resource requests, and resource limits for a deployment.
- **`MimirClient`** (`plugins/gs/src/apis/mimir/MimirClient.ts`) — API client implementing `MimirApi`. Sends `GET` requests to the backend at `/mimir/query` with the OIDC token in the `X-Mimir-Token` header.
- **`MimirApi` / `mimirApiRef`** (`plugins/gs/src/apis/mimir/types.ts`) — API interface and ref (ID: `plugin.gs.mimir`).

### Backend

- **`MimirService`** (`plugins/gs-backend/src/services/MimirService.ts`) — looks up the installation's `baseDomain` from config, constructs the Mimir URL (`https://observability.${baseDomain}/prometheus/api/v1/query`), forwards the OIDC token as `Authorization: Bearer`, and sets `X-Scope-OrgID: giantswarm`.
- **Route** (`plugins/gs-backend/src/router.ts`) — `GET /mimir/query` validates `query`, `installationName`, and `X-Mimir-Token` header via Zod, then delegates to `MimirService.query()`.

### Adding a New Query Hook

1. Register any new metrics in `metrics.ts` (see above).
2. Create a new hook file in `plugins/gs/src/components/hooks/` (e.g. `useMimirMyData.ts`).
3. Use `useMimirQuery` for each PromQL query, referencing metric names from the registry.
4. Use `extractScalar` / `extractScalarByResource` patterns from `useMimirResourceUsage.ts` for parsing responses.
