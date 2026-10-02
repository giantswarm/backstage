# @giantswarm/backstage-plugin-scaffolder-backend-module-gs

## 0.13.0

### Minor Changes

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

### Patch Changes

- 4785d59: `kube:apply` now honors `caFile` on clusters declared under
  `kubernetes.clusterLocatorMethods`. The factory previously read only `caData`,
  so a cluster configured with `caFile` (the standard way to point at the mounted
  service-account CA, `/var/run/secrets/kubernetes.io/serviceaccount/ca.crt`, and
  what the agent-platform-standalone chart generates) produced a client with no
  CA at all. Node then fell back to its bundled trust store and every request
  failed with `unable to verify the first certificate` — surfacing in the agent
  creation flow as "Failed to fetch resource metadata for
  source.toolkit.fluxcd.io/v1/OCIRepository". `@kubernetes/client-node` resolves
  `caFile` natively, so the value is passed straight through.

## 0.12.0

### Minor Changes

- b928d80: Add `fromJson` Nunjucks template filter for deserializing JSON strings in scaffolder templates.

## 0.11.0

### Minor Changes

- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.

## 0.10.0

### Minor Changes

- 2294710: Updated Backstage to v1.40.1.

## 0.9.0

### Minor Changes

- 09bae90: Updated Backstage packages to v1.38.1.
- d121c2e: Updated dependencies.

## 0.8.1

### Patch Changes

- 84ae9db: Moved from custom scaffolder actions to backstage-scaffolder-kubernetes plugin.

## 0.8.0

### Minor Changes

- 1aad32a: Handle cluster creation state.
- 1aad32a: Added custom scaffolder action to apply manifest to a cluster.
- 1aad32a: Added InstallationPicker, OrganizationPicker, ReleasePicker scaffolder fields.

## 0.7.0

### Minor Changes

- f42edd2: Updated Backstage to v1.37.0.

## 0.6.0

### Minor Changes

- 9e6f3c1: Backstage was updated to v1.36.1.

### Patch Changes

- c5d9972: Enable default auth policy.
- e06b6cd: Update dependencies.

## 0.5.0

### Minor Changes

- ca553ba: Update Backstage packages to v1.34.2

## 0.4.0

### Minor Changes

- 3cd9851: Update dependencies.
- cebd404: Update Backstage to v1.33.5.

## 0.3.0

### Minor Changes

- f508faf: Update Backstage packages to v1.32.5.

## 0.2.0

### Minor Changes

- b2b5cce: Update Backstage packages to v1.31.3
- 9aaa464: GS plugins were renamed in preparation to publish them.
