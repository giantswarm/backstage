---
'@giantswarm/backstage-plugin-auth-backend-module-gs': patch
---

Retry OIDC issuer metadata discovery for the main login provider and fail
backend startup if it stays unreachable.

Previously a transient Dex outage during backend startup made the module skip
registering the main login provider entirely: the portal came up healthy but
every login returned `404 Unknown auth provider` until the pod was manually
restarted. Metadata discovery is now retried with exponential backoff (5
attempts over ~15s), and if the issuer is still unreachable the module throws
so the backend exits and the orchestrator restarts it until Dex is reachable
again — the portal self-heals instead of silently serving without login.
