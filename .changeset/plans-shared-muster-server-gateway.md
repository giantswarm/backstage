---
'@giantswarm/backstage-plugin-plans': minor
'@giantswarm/backstage-plugin-plans-backend': minor
'@giantswarm/backstage-plugin-gs-node': minor
---

The plans backend reaches GitHub through the muster server gateway shared in
`@giantswarm/backstage-plugin-gs-node` (`MusterServerClient`, `asConnected`,
`MusterServerNotConnectedError`) instead of its own copy of it. A caller
without a GitHub grant now gets the same `401` the roadmap backend answers:
`error.name: MusterServerNotConnectedError` with `error.server` and
`error.authUrl` (was `GithubNotConnectedError`). The plans frontend recognises
that name for its "Connect GitHub" step; its exported error class is renamed
to `MusterServerNotConnectedError` accordingly.

`MusterServerGateway` names the MCPServer it fronts (`server`), so backends
no longer read it off the client by cast.
