# backend

## 0.14.1

### Patch Changes

- 53c5d68: Expose additional MCP tools via the catalog MCP backend plugin
- Updated dependencies [24a4c48]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.2.3

## 0.14.0

### Minor Changes

- 1a75706: Add AI Chat plugin.

### Patch Changes

- Updated dependencies [1a75706]
  - @giantswarm/backstage-plugin-ai-chat-backend@0.2.0

## 0.13.1

### Patch Changes

- Updated dependencies [f665c62]
  - @giantswarm/backstage-plugin-gs-backend@0.3.0

## 0.13.0

### Minor Changes

- 7f837a5: Add GS backend plugin.

### Patch Changes

- Updated dependencies [7f837a5]
  - @giantswarm/backstage-plugin-gs-backend@0.2.0

## 0.12.0

### Minor Changes

- 3b06846: Update Backstage to v1.43.

## 0.11.1

### Patch Changes

- d7a5609: Fixed helm chart for extraEnvVars

## 0.11.0

### Minor Changes

- 2294710: Updated Backstage to v1.40.1.

### Patch Changes

- Updated dependencies [2294710]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.11.0
  - @internal/backend-common@0.3.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.10.0
  - @giantswarm/backstage-plugin-techdocs-backend-module-gs@0.9.0

## 0.10.0

### Minor Changes

- 4c21763: Added a headless backend package to serve auth and scaffolder plugins separately from the main backend instance.

### Patch Changes

- Updated dependencies [4c21763]
  - @internal/backend-common@0.2.0

## 0.9.0

### Minor Changes

- d9eb6f4: Removed custom GitHub auth provider.

## 0.8.0

### Minor Changes

- 09bae90: Updated Backstage packages to v1.38.1.
- d121c2e: Updated dependencies.

### Patch Changes

- Updated dependencies [09bae90]
- Updated dependencies [d121c2e]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.10.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.9.0
  - @giantswarm/backstage-plugin-techdocs-backend-module-gs@0.8.0

## 0.7.5

### Patch Changes

- 910a2fe: Fixed Sentry configuration on backend.

## 0.7.4

### Patch Changes

- 6a11b8c: Added a rule to Sentry configuration to ignore TechDocs warnings.

## 0.7.3

### Patch Changes

- 84ae9db: Moved from custom scaffolder actions to backstage-scaffolder-kubernetes plugin.
- Updated dependencies [84ae9db]
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.8.1

## 0.7.2

### Patch Changes

- Updated dependencies [03e8bfc]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.9.0

## 0.7.1

### Patch Changes

- Updated dependencies [1aad32a]
- Updated dependencies [1aad32a]
- Updated dependencies [1aad32a]
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.8.0

## 0.7.0

### Minor Changes

- f42edd2: Updated Backstage to v1.37.0.

### Patch Changes

- Updated dependencies [f42edd2]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.8.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.7.0
  - @giantswarm/backstage-plugin-techdocs-backend-module-gs@0.7.0

## 0.6.0

### Minor Changes

- 9e6f3c1: Backstage was updated to v1.36.1.

### Patch Changes

- c5d9972: Enable default auth policy.
- e06b6cd: Update dependencies.
- Updated dependencies [9e6f3c1]
- Updated dependencies [c5d9972]
- Updated dependencies [e06b6cd]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.7.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.6.0
  - @giantswarm/backstage-plugin-techdocs-backend-module-gs@0.6.0

## 0.5.0

### Minor Changes

- ca553ba: Update Backstage packages to v1.34.2

### Patch Changes

- Updated dependencies [ca553ba]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.6.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.5.0
  - @giantswarm/backstage-plugin-techdocs-backend-module-gs@0.5.0

## 0.4.3

### Patch Changes

- 0d25e63: Remove undici proxy configuration for Backstage backend.

## 0.4.2

### Patch Changes

- 7f3d6af: Allow to configure HTTP proxy for backend.

## 0.4.1

### Patch Changes

- Updated dependencies [3d05628]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.5.0

## 0.4.0

### Minor Changes

- b833a2b: Add custom root logger service that reports errors to Sentry.

## 0.3.0

### Minor Changes

- 3cd9851: Update dependencies.
- cebd404: Update Backstage to v1.33.5.

### Patch Changes

- Updated dependencies [3cd9851]
- Updated dependencies [cebd404]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.4.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.4.0
  - @giantswarm/backstage-plugin-techdocs-backend-module-gs@0.4.0

## 0.2.0

### Minor Changes

- 06092e9: Change GS auth backend module to support client side OIDC provider.
- f508faf: Update Backstage packages to v1.32.5.

### Patch Changes

- 06092e9: Move custom GitHub auth provider from GS backend module to backend package.
- Updated dependencies [06092e9]
- Updated dependencies [f508faf]
- Updated dependencies [06092e9]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.3.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.3.0
  - @giantswarm/backstage-plugin-techdocs-backend-module-gs@0.3.0

## 0.1.0

### Minor Changes

- b2b5cce: Update Backstage packages to v1.31.3
- 9aaa464: GS plugins were renamed in preparation to publish them.

### Patch Changes

- Updated dependencies [b2b5cce]
- Updated dependencies [9aaa464]
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.2.0
  - @giantswarm/backstage-plugin-techdocs-backend-module-gs@0.2.0
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.2.0
