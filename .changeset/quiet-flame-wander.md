---
'@giantswarm/backstage-plugin-gs-node': minor
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-gs-backend': patch
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-backend': patch
'@giantswarm/backstage-plugin-agent-platform-common': patch
'@giantswarm/backstage-plugin-muster-backend': patch
'@giantswarm/backstage-plugin-plans-backend': patch
'@giantswarm/backstage-plugin-roadmap-backend': patch
'@giantswarm/backstage-plugin-platform-capabilities-backend': patch
'@giantswarm/backstage-plugin-repositories-backend': patch
'@giantswarm/backstage-plugin-auth-backend-module-gs': patch
---

Report a Mimir that cannot answer a query to Sentry once, under a fixed title,
and say on the page when older data is temporarily unavailable.

`MimirService` logs every failed query once as a warning with a fixed message
(`Mimir answered a query with HTTP <status>`, `Mimir could not be reached`, or
`Mimir could not read older data: no healthy store-gateway`), with the
installation, the status and Mimir's own error text in the metadata, and throws
the new `MimirUnavailableError`. Its message no longer carries Mimir's body;
that travels in `mimirError`. The gs backend's `/mimir/query` and
`/mimir/query_range` routes answer it 503 themselves, so the error middleware
no longer reports it again. A Mimir without a healthy store-gateway answers
with `error.reason: 'older_data_unavailable'` (`MIMIR_UNAVAILABLE_REASONS` in
gs-common), and the model cost route answers `older-data-unavailable`.

gs-node's answer-it-in-the-router pattern is now generic:
`ReportedServiceUnavailableError` with `reportedErrorHandler()`, which replaces
`musterUnreachableErrorHandler()` (`MusterUnreachableError` is one), and
`errorResponseBody()` for a router that answers some other error with the body
the error middleware would send.

ui-react adds `MetricsUnavailableAlert` and `describeMimirFailure`, which every
place that shows a failed Mimir read now uses: a deployment's resource usage
and hostnames, a cluster's gateways and node pool nodes, the workload status
summary, the Usage overview and cost pages, the activity heatmap, an agent's
and a model's Usage tab, and the cost estimate and actual-cost hints.
`MimirClient` throws a `MimirQueryError` that carries the backend's `reason`.
