---
'@giantswarm/backstage-plugin-auth-backend-module-gs': patch
---

Retry OIDC issuer metadata discovery for the main login provider, fail backend
startup if it stays unreachable, and stop caching a failed discovery for the
lifetime of the process.

Previously a transient Dex outage during backend startup made the module skip
registering the main login provider entirely: the portal came up healthy but
every login returned `404 Unknown auth provider` until the pod was manually
restarted.

- Metadata discovery is now checked at startup through openid-client's
  `Issuer.discover` — the same code path and validation the oidc authenticator
  uses, bounded by its built-in HTTP timeout — and retried with exponential
  backoff (5 attempts over ~15s). If the issuer is still unreachable the
  module throws so the backend exits and the orchestrator restarts it until
  Dex is reachable again — the portal self-heals instead of silently serving
  without login. A malformed `metadataUrl` fails immediately without retries.
- The registered provider now uses `gsOidcAuthenticator`, a wrapper around the
  upstream oidc authenticator that memoizes issuer discovery only on success.
  If Dex becomes unreachable after startup, each login attempt triggers a
  fresh discovery instead of the upstream behaviour of caching the first
  rejection until the process restarts.
- Note on scope: configuration errors for the main login provider (missing
  environment block or `metadataUrl`) now also fail startup instead of
  starting the portal without login — broken required-login config should be
  loud.
