---
'@giantswarm/backstage-plugin-muster': patch
---

Refresh the workflow reads immediately after a mutation succeeds, instead of
leaving the workflows page stale until the next 30s background poll.

Confirming a workflow delete (and saving an ad-hoc workflow definition) now
triggers the provider's CRD refetch, with one ~2.5s follow-up for the
reconciler-trailing availability status — the same post-mutation refresh the
MCP servers page gained. Unlike the servers page, the workflow list has no
runtime aggregator query: the provider's CRD reads are the whole read path,
so no extra react-query invalidation is needed. The success copy now says the
list has been refreshed rather than promising it "will refresh shortly".
