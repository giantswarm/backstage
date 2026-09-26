# backend-headless-service

## 0.7.3

### Patch Changes

- db58c71: Replace the `@devangelista/backstage-scaffolder-kubernetes` and
  `@aws/aws-core-plugin-for-backstage-scaffolder-actions` scaffolder plugins with
  an in-repo `kube:apply` action in the GS scaffolder backend module.

  - `kube:apply` keeps the exact action ID and input schema
    (`manifest`, `namespaced`, `clusterName`, `token`), so existing templates —
    including the hidden `agent-deployment` template driven by the Agent Platform
    create flow — keep working unchanged. It resolves clusters from
    `kubernetes.clusterLocatorMethods` (type `config`) the same way as before:
    OIDC clusters use the per-task user token, `serviceAccount` clusters their
    static token, with a fallback to the default kubeconfig.
  - The other actions from those plugins (`kube:delete`, `kube:job:wait`,
    `aws:cloudcontrol:create`, `aws:codecommit:publish`, `aws:eventbridge:event`,
    `aws:s3:cp`) have no usage in any template and are dropped.
  - The devangelista plugin pinned old `@backstage/*` and
    `@kubernetes/client-node` ranges, nesting ~185MB of duplicate dependencies
    (including the deprecated `@backstage/backend-common`, which is now gone
    entirely); the AWS plugin nested another ~80MB of duplicate `@aws-sdk`
    clients. Together with a `yarn dedupe`, `node_modules` shrinks by roughly
    850MB, most of which was shipped in the backend image.

- Updated dependencies [9c3a9c4]
- Updated dependencies [0a10f54]
- Updated dependencies [9fd228e]
- Updated dependencies [db58c71]
- Updated dependencies [a1292a5]
- Updated dependencies [8967f50]
- Updated dependencies [e9a6141]
- Updated dependencies [4785d59]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.16.0
  - @giantswarm/backstage-plugin-scaffolder-backend-module-gs@0.13.0

## 0.7.2

### Patch Changes

- Updated dependencies [865790a]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.15.0

## 0.7.1

### Patch Changes

- Updated dependencies [5b7e7ba]
  - @giantswarm/backstage-plugin-auth-backend-module-gs@0.14.0

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
