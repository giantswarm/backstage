---
'@giantswarm/backstage-plugin-muster': patch
---

Fix the MCP Servers section landing on a blank view with no tab selected.

Opening the Agent Platform "MCP Servers" tab a second time within a session left
the URL on `/agent-platform/muster` with no view rendered and no second-level tab
highlighted. `MusterInstanceProvider` writes the active installation into
`?installation=` from an effect, and that search-only navigation resolves against
the pathname of the render that created it — so when it ran in the same commit as
the section's index redirect (which it does once the installations query is
cached), it replaced `/muster/dashboard` back with `/muster`.

The index redirect and the legacy `workflows/:name/run` redirect are now mounted
as siblings of the views, outside `MusterProviders`, so they can no longer be
overwritten by the installation-param write. The index redirect also keeps the
query string, so a deep link like `/agent-platform/muster?installation=alpha` no
longer loses the requested installation to the default on the way to the
dashboard.
