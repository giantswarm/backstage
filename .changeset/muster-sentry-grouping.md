---
'@giantswarm/backstage-plugin-gs-node': patch
'@internal/backend-common': patch
---

Report Muster connection failures to Sentry as one issue per kind of failure
instead of one per installation. `MusterMcpClient` logs `Muster MCP request
failed: <reason>` with the installation in the log metadata, and logs a lost
session that it re-initializes and retries at `info` instead of `warn`. The
backend's Sentry event normalizer collapses the error middleware's `Request
failed with status 503 <installation> did not answer: <reason>` across
installations, keeping the original message as extra data. The error text the
person sees is unchanged.
