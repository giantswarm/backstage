---
'@internal/backend-common': patch
'backend': patch
'backend-headless-service': patch
---

With `NODE_USE_ENV_PROXY=1`, the backend refuses to start on a Node version that would let native `fetch` bypass the proxy, and the error names the version it needs (24.17 or later; Node 22 and Node 25 do not qualify). On those versions, Node's own proxy support did not stay in charge of `fetch` as the earlier entry said: loading undici 8 replaced Node's proxy dispatcher with a direct one, so catalog URL reads, the scaffolder and most plugins silently went around the proxy. `configureFetchProxy` runs the check through the new `assertEnvProxySupported`.
