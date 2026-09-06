---
'app': minor
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-auth-backend-module-gs': minor
---

The login page signs in through the main OIDC login provider only; the
`gs.signInProviders` list and its GitHub-provider card are gone. Which Dex
connector a sign-in lands on is now a deployment choice: the provider's
`startUrlSearchParams.connector_id` pins the default connector, and
`gs.signInFallbackProvider` adds a second card that signs in through the same
provider pinned to another connector (for people the default one cannot
authenticate). The Giant Swarm OIDC authenticator forwards a `connector_id`
passed on `/start` to Dex for that request; `gsFallbackSignInAuthApiRef`
exposes the fallback sign-in API.
