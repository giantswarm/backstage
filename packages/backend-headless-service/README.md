# backend-headless-service

> [!WARNING]
> **Deprecated / retired.** This per-cluster "headless" backend was how a
> private management cluster used to expose its own auth/scaffolder/kubernetes
> plugins, reached via a `gs.installations.<mc>.backendUrl` override and its own
> `oidc-<mc>` provider. It has been replaced by the broker-only model: every
> cluster (public and private) is reached from the central backend, with
> per-cluster Kubernetes tokens minted silently through the muster cluster-token
> broker from the user's single main Dex session (`gs.clusterTokenBroker`). See
> [`docs/configuration.md`](../../docs/configuration.md) and
> [`app-config.example.yaml`](../../app-config.example.yaml). New setups should
> not deploy this backend.

This package is a simplified version of the Backstage backend package that serves only
a limited number of plugins - auth, scaffolder, kubernetes.

## Development

To run the backend headless service, first go to the project root and run

```bash
yarn install
```

You should only need to do this once.

After that, run

```bash
yarn start backend-headless-service --config ../../app-config.headless-service.yaml
```

If you don't have `app-config.headless-service.yaml` configuration file yet, create one
at project root using a per-cluster `oidc-<mc>` provider. Note this is the legacy
pattern; the maintained example is the broker-based
[`app-config.example.yaml`](../../app-config.example.yaml).

The backend starts up on port 7008 per default.
