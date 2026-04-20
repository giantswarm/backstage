# backend-headless-service

## 0.7.0

### Minor Changes

- 89aa3f2: Use custom X-Backstage-Token header for Backstage identity tokens to avoid conflicts with ingress-level Basic auth on the Authorization header.

### Patch Changes

- Updated dependencies [89aa3f2]
  - @internal/backend-common@0.5.0

## 0.6.1

### Patch Changes

- Updated dependencies [b928d80]
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.12.0

## 0.6.0

### Minor Changes

- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.

### Patch Changes

- Updated dependencies [ebd466f]
  - @internal/backend-common@0.4.0
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.13.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.11.0

## 0.5.1

### Patch Changes

- Updated dependencies [a68a2b2]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.12.0

## 0.5.0

### Minor Changes

- a478023: Added Kubernetes plugin to the backend-headless-service package.

## 0.4.0

### Minor Changes

- 3b06846: Update Backstage to v1.43.

## 0.3.1

### Patch Changes

- d7a5609: Fixed helm chart for extraEnvVars

## 0.3.0

### Minor Changes

- 2294710: Updated Backstage to v1.40.1.

### Patch Changes

- Updated dependencies [2294710]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.11.0
  - @internal/backend-common@0.3.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.10.0

## 0.2.0

### Minor Changes

- 4c21763: Added a headless backend package to serve auth and scaffolder plugins separately from the main backend instance.

### Patch Changes

- Updated dependencies [4c21763]
  - @internal/backend-common@0.2.0
