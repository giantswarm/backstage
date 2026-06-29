---
'@giantswarm/backstage-plugin-muster': patch
---

Expose freshness for the muster UI's live health reads.

The kubernetes-read-backed health data (dashboard stat row + fleet health; MCP-servers per-MC pills) was a point-in-time snapshot fetched once on load, with no indication of staleness -- it flapped silently against the live CRD between page loads. It now:

- auto-refreshes in the background via a light `refetchInterval` on the MCPServer/Workflow CRD reads, configured once in `MusterInstanceProvider` so both the dashboard and the MCP-servers manager benefit (without blanking the page);
- surfaces `dataUpdatedAt` and an `isRefreshing` flag from the provider, rendered as a shared "updated Xs ago" indicator plus a manual refresh control on the dashboard fleet-health section and the MCP-servers standard-servers section.
