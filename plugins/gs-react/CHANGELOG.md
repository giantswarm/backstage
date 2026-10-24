# @giantswarm/backstage-plugin-gs-react

## 0.1.0

### Minor Changes

- 4b7522d: A portal tab left open past the Dex ID token's lifetime no longer sends muster
  an expired token. The portal session now expires with the ID token's own `exp`,
  so it is refreshed before the token lapses, or the person is asked to sign in
  again when the refresh fails. The muster client never forwards an expired ID
  token, and muster's "token has expired … re-authenticate" answer reads "Your
  session expired, sign in again." with the Sign in again action instead of the
  raw text. `idTokenExpiresAt` and `isIdTokenExpired` are new in gs-react.
- eb337fb: Serve the config the signed-in frontend reads from the authenticated
  `GET /api/gs/config` instead of the public `index.html`.

  The unauthenticated page carried every `@visibility frontend` path, and the gs
  plugin marked whole blocks `@deepVisibility frontend`: the admin groups, the
  cluster token broker URL, the link templates with the fleet's hostnames, the
  friendly labels and annotations, the Kubernetes end-of-life table and the proxy
  knobs were readable by anyone who could reach the portal. They now keep the
  default (backend) visibility and reach the browser once, after sign-in, as one
  payload in app-config shape: `GET /api/gs/config` replaces
  `GET /api/gs/installations` and serves the paths listed in the gs-backend's
  `SIGNED_IN_CONFIG_PATHS`.

  - New `@giantswarm/backstage-plugin-gs-react`: the module-level source of the
    signed-in config, `useSignedInConfig()` for components and
    `getSignedInConfig()` for the utility APIs built at app boot.
  - The gs plugin's `SignedInConfigLoader` (replacing `InstallationsConfigLoader`)
    publishes the payload; `useInstallations` and the boot-time APIs read the
    installations from it; the cluster-access, tools, resources, labels and
    Kubernetes-version views read their keys from it.
  - `@visibility frontend` stays, per field, only on what the sign-in page needs:
    `gs.authProvider`, `gs.auth.scopes`, `gs.auth.extraScopes`, the two sign-in
    cards and `gs.github.brokerAudience` (read when the app constructs its
    GitHub auth API, before sign-in). `@deepVisibility frontend` is gone from
    the gs plugin.

- cba71a8: An agent turn (a message, streamed or not, and the answer to a confirmation)
  goes out with an ID token that has at least 25 of its 30 minutes left, so a
  long turn no longer fails part-way with `Unauthorized` when the token the
  session had cached runs out. The session is refreshed silently first when its
  token has less of its lifetime left; reads keep Backstage's 3-minute margin. A
  turn whose token could not be refreshed is still sent, with a console warning.

  - `gs`: the Kubernetes auth APIs (`LastingAuthApi`) carry
    `getLastingIdToken(minLifetimeLeft)`; its refresh never opens a sign-in.
  - `gs-react`: `idTokenLifetimeLeft` and `hasIdTokenLifetimeLeft`.
  - `gs-common`: `readJwtClaims`, `readJwtLifetimeClaims` and
    `jwtLifetimeSeconds`, the one unverified JWT claims reader of frontend and
    backend.
  - `kubernetes-react`: `getInstallationOidcToken` takes `{ minLifetimeLeft }`.
  - `auth-backend-module-gs`: `POST /cluster-token/:installation` takes
    `?minLifetimeLeft=` and re-exchanges a cached token with less of its
    lifetime (`exp` − `iat`, on the issuer's clock) left.

### Patch Changes

- Updated dependencies [9312feb]
- Updated dependencies [21ae39b]
- Updated dependencies [2fa183d]
- Updated dependencies [e5bd97a]
- Updated dependencies [846f143]
- Updated dependencies [cba71a8]
- Updated dependencies [103014c]
- Updated dependencies [0af6fea]
  - @giantswarm/backstage-plugin-gs-common@0.22.0
