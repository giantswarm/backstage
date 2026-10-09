---
'@giantswarm/backstage-plugin-gs-backend': patch
---

`/agent-skills` says when GitHub refused a read because a rate limit tripped, instead of a bare 403 or 429: the primary limit used up, until when, and whether the portal reads GitHub without a token (60 requests an hour per IP), or the secondary limit, with when to retry.
