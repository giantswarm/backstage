---
'@giantswarm/backstage-plugin-muster': patch
---

Render the muster dashboard body immediately on a cold load instead of blanking it behind a full-page spinner.

The dashboard previously gated its whole body on `isLoading` (installations + the single-cluster MCPServer CRD read). On a cold first load that read can be queued behind the Backstage whole-fleet cluster-access warm-up, so the page showed only a spinner for several seconds. The page now:

- gates only on the active installation being resolved, then renders the chrome (identity, endpoint, browse cards, sections) immediately from persisted/last-known data;
- shows a thin progress bar under the header and `…` / "Loading…" placeholders for the stats, browse counts, and fleet-health matrix while the live CRD read is still in flight, instead of a misleading "0 servers" / "No MCP servers found".

The root-cause serialization fix (foreground proxy reads jumping ahead of the fleet warm-up) ships separately in `@giantswarm/backstage-plugin-gs`.
