---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-gs': minor
'@giantswarm/backstage-plugin-gs-react': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-auth-backend-module-gs': minor
---

An agent turn (a message, streamed or not, and the answer to a confirmation)
goes out with an ID token that has at least 25 of its 30 minutes left, so a
long turn no longer fails part-way with `Unauthorized` when the token the
session had cached runs out. The session is refreshed silently first when its
token has less of its lifetime left; reads keep Backstage's 3-minute margin. A
turn whose token could not be refreshed is still sent, with a console warning.

- `gs`: `GSAuthProvidersApi.getLastingIdToken(providerName, minLifetimeLeft)`.
- `gs-react`: `idTokenLifetimeLeft` and `hasIdTokenLifetimeLeft`.
- `kubernetes-react`: `getInstallationOidcToken` takes `{ minLifetimeLeft }`.
- `auth-backend-module-gs`: `POST /cluster-token/:installation` takes
  `?minLifetimeLeft=` and re-exchanges a cached token with less of its
  lifetime left.
