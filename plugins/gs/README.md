# Giant Swarm Plugin

## Setup

### Generic Requirements

1. Configure Management API endpoints for desired installations:

  Example:

  ```yaml
    # In app-config.yaml
    gs:
      installations:
        golem:
          apiEndpoint: https://happaapi.golem.gaws.gigantic.io
        snail:
          apiEndpoint: https://happaapi.snail.gaws.gigantic.io
  ```

2. Set up a proxy for each Management API endpoint:

  Example:

  ```yaml
    # In app-config.yaml
    proxy:
      endpoints:
        /gs/api/golem:
          target: https://happaapi.golem.gaws.gigantic.io/
          allowedHeaders: ['Authorization']
        /gs/api/snail:
          target: https://happaapi.snail.gaws.gigantic.io/
          allowedHeaders: ['Authorization']
  ```

3. Set up an auth provider for each Management API endpoint:

  Example:

  ```yaml
    # In app-config.yaml
    auth:
      session:
        secret: ${AUTH_SESSION_SECRET}
      providers:
        gs-golem:
          development:
            metadataUrl: https://dex.golem.gaws.gigantic.io/.well-known/openid-configuration
            clientId: ${AUTH_DEX_GOLEM_CLIENT_ID}
            clientSecret: ${AUTH_DEX_GOLEM_CLIENT_SECRET}
        gs-snail:
          development:
            metadataUrl: https://dex.snail.gaws.gigantic.io/.well-known/openid-configuration
            clientId: ${AUTH_DEX_SNAIL_CLIENT_ID}
            clientSecret: ${AUTH_DEX_SNAIL_CLIENT_SECRET}
  ```

### To display a list of deployments for a catalog entity:

1. Annotate your component with a list of possible deployment names:

  The annotation key is `giantswarm.io/deployment-names`.
  The annotation value is a string with comma separated deployment names.

  Example:

  ```yaml
  apiVersion: backstage.io/v1alpha1
  kind: Component
  metadata:
    name: backstage
    description: backstage.io
    annotations:
      backstage.io/source-location: url:https://github.com/giantswarm/backstage
      giantswarm.io/deployment-names: backstage, backstage-app
  spec:
    type: website
    lifecycle: production
    owner: user:guest
  ```

  The annotation `backstage.io/source-location` is not required, but if present will be
  used to display a link to a deployment's release notes.

2. Add to the app `EntityPage` component:

```tsx
// In packages/app/src/components/catalog/EntityPage.tsx
import { EntityGSDeploymentsContent } from '@internal/plugin-gs';

// You can add the tab to any number of pages, the service page is shown as an
// example here
const serviceEntityPage = (
  <EntityLayout>
    {/* other tabs... */}
    <EntityLayout.Route path="/deployments" title="Deployments">
      <EntityGSDeploymentsContent />
    </EntityLayout.Route>
```

3. Run the app with `yarn start` and the backend with `yarn start-backend`.
   Then navigate to `/deployments/` under any entity.


## Features

- List deployments for a catalog entity
- List Kubernetes clusters

## Limitations

- Since the plugin connects to each installation directly, a user has to log in to each one of them.
