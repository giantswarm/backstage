---
'@giantswarm/backstage-plugin-muster': patch
---

Fix the muster Tool explorer browse tree so shared federated tools are no longer attributed to an arbitrary peer management cluster, the grouping no longer flickers on load, and `?server=` deep links scope correctly.

- Shared/deduplicated federated tools (one `x_<family>` prefix that maps to many management clusters, targeted via the `management_cluster` argument) are now bucketed under a neutral family-level fleet label (`Kubernetes (fleet)` / `Prometheus (fleet)`) instead of the alphabetically-first peer MC, and split by family. Each server bucket's subtitle is derived from the family set it actually holds (and the federated cluster count for fleet groups), not from whichever server created the bucket (ADR muster-ui-iteration-2 D1).
- The browse grouping waits for the MCPServer CRs to load before rendering, so the sections no longer reshuffle from raw `Server: <segment>` buckets to management-cluster buckets on load.
- A `?server=` deep link now scopes the browse to that server's tools by tool-name prefix (with a clearable scope banner) instead of seeding a free-text search that also matched every tool whose description mentioned the segment.
