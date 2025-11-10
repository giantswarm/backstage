# backend-headless-service

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
at project root. Use `app-config.headless-service.example.yaml` as an example.

The backend starts up on port 7008 per default.
