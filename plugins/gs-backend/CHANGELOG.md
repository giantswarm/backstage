# @giantswarm/backstage-plugin-gs-backend

## 0.9.1

### Patch Changes

- a240221: Decouple custom branding from the gs-backend plugin. Branding asset serving moves to a dedicated `branding` backend plugin colocated in `packages/backend/src/branding/`, registered unconditionally so it works in deployments without a `gs:` config block. The frontend hook now resolves assets via the `branding` discovery prefix at `/api/branding/*`.

## 0.9.0

### Minor Changes

- 0f6cd54: Add custom branding asset support with logo overrides, allowing organizations to customize UI logos via mounted volumes without code changes.

## 0.8.0

### Minor Changes

- fca7f1a: Add authenticated GitHub content fetching for private repositories. Helm chart README, values schema, and values YAML are now fetched through a backend endpoint that adds GitHub credentials, instead of direct unauthenticated browser fetches.

### Patch Changes

- 6e25580: Fix AI chat `get-helm-chart-values` tool failing with 500 for private OCI registries by authenticating GitHub URL fetches using Backstage's GitHub integration credentials.

## 0.7.0

### Minor Changes

- 7b162b5: Add support for authenticated access to private OCI container registries

## 0.6.0

### Minor Changes

- a1fe62e: Add MCP tool get-helm-chart-values for fetching Helm chart default values and schema

## 0.5.0

### Minor Changes

- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.

## 0.4.0

### Minor Changes

- cb579b3: Add metrics display to deployments details page

## 0.3.2

### Patch Changes

- d070c3a: Improve container registry error handling with user-friendly messages for missing repositories and consistent HTTP status code reporting.

## 0.3.1

### Patch Changes

- f3f3a50: Proper HTTP Error Handling for Container Registry Clients

## 0.3.0

### Minor Changes

- f665c62: Add Helm chart versions history.

## 0.2.0

### Minor Changes

- 7f837a5: Add container registry service.
