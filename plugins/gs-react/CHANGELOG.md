# @giantswarm/backstage-plugin-gs-react

## 0.1.0

### Minor Changes

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
