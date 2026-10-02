---
'backend': patch
'backend-headless-service': patch
'@internal/backend-common': minor
---

The backend routes Node's native `fetch` through the `GLOBAL_AGENT_HTTP_PROXY` / `GLOBAL_AGENT_HTTPS_PROXY` proxy, honouring `GLOBAL_AGENT_NO_PROXY`. `global-agent` only patches the `http`/`https` modules, so behind an egress proxy the catalog's URL reads (locations, templates) failed with `fetch failed`. `@internal/backend-common` exports `configureFetchProxy`, which installs undici's `EnvHttpProxyAgent` as the global dispatcher; with `NODE_USE_ENV_PROXY=1` Node's own proxy support stays in charge.
