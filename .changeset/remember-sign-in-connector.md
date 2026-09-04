---
'@giantswarm/backstage-plugin-gs': minor
---

Silent re-logins of the main OIDC login provider reuse the Dex connector the
person signed in with. A sign-in through the login page's fallback card
(`gs.signInFallbackProvider.connectorId`) is remembered for the browser in
localStorage (`gs.auth.connector`); the main provider's login popups and
redirects then carry that `connector_id`, so the re-login popups that AI chat,
cluster access or muster open once the refresh token is gone land on the
connector the person can actually use instead of the deployment's default one.
`/refresh` is untouched. Picking the main card on the login page, or signing
out, forgets the connector. `SignInConnectorMemory` and
`LocalStorageSignInConnectorMemory` are exported; `GSAuthProviders` takes an
optional `signInConnectorMemory`.
