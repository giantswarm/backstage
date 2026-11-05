---
'@giantswarm/backstage-plugin-gs-node': patch
'@giantswarm/backstage-plugin-muster-backend': patch
'@giantswarm/backstage-plugin-plans-backend': patch
'@giantswarm/backstage-plugin-roadmap-backend': patch
'@giantswarm/backstage-plugin-platform-capabilities-backend': patch
'@giantswarm/backstage-plugin-repositories-backend': patch
'@giantswarm/backstage-plugin-auth-backend-module-gs': patch
---

Report a Muster installation that cannot be reached to Sentry once, as one
issue per kind of failure instead of one per installation. `MusterMcpClient`
logs `Muster MCP request failed: <reason>` with the installation in the log
metadata and throws the new `MusterUnreachableError` (a
`ServiceUnavailableError`). Every backend router that calls muster answers it
503 through `musterUnreachableErrorHandler()`, with the body the error
middleware sends, so the middleware no longer reports the same failure again. A
lost session that the client re-initializes and retries is logged at `info`
instead of `warn`, and a warning says so when one installation loses ten
sessions within ten minutes. The error text the person sees is unchanged, except
that `list_tools` still being truncated after 20 pages no longer names the
installation.
