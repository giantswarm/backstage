# @giantswarm/backstage-plugin-kubernetes-react

## 0.11.1

### Patch Changes

- cd3f13e: Add getters
- Updated dependencies [b1b1b7a]
- Updated dependencies [b1b1b7a]
- Updated dependencies [b1b1b7a]
  - @giantswarm/backstage-plugin-ui-react@0.7.2

## 0.11.0

### Minor Changes

- 23e9f63: Extract error reporter API into dedicated package

  **New package: `@giantswarm/backstage-plugin-error-reporter-react`**
  - Provides `ErrorReporterApi` interface and `errorReporterApiRef` for reporting errors to external services
  - Can be used by any plugin that needs to report errors

  **Breaking change in `@giantswarm/backstage-plugin-kubernetes-react`**
  - Removed `errorReporterApiRef` export (now in `@giantswarm/backstage-plugin-error-reporter-react`)
  - Error reporter is now optional: if not registered, only console logging occurs
  - API version issues are now always logged to console in addition to error reporter

  **Changes in `app`**
  - Removed `ErrorReporterProvider` React context wrapper
  - Error reporter is now registered as a standard Backstage API via `createApiFactory`
  - Simplified implementation by merging `SentryErrorNotifier` into `SentryErrorReporter`

### Patch Changes

- 8e3e4a4: Fix API version discovery for resources with different version support
  - Implement two-stage API discovery that queries available versions and then checks which version actually serves the specific resource
  - Extract shared query logic into `queryFactories.ts` for use by both `usePreferredVersion` and `usePreferredVersions`

- 8e3e4a4: Enhance Flux details panel with additional metadata
  - Add creation timestamp, interval, and resource-specific metadata to details panel and list view
  - Extract `findHelmReleaseChartName` utility into flux-react for shared use
  - Add convenience accessors to HelmRelease, GitRepository, OCIRepository, and HelmRepository resource classes

- Updated dependencies [23e9f63]
  - @giantswarm/backstage-plugin-error-reporter-react@0.2.0

## 0.10.0

### Minor Changes

- b4b5fc2: Add v1 version support to OCIRepository and HelmRepository resources
- 3e3dd4c: Add support for Flux ImagePolicy, ImageRepository, ImageUpdateAutomation

## 0.9.2

### Patch Changes

- 286d31a: Improve Helm chart name resolution with OCIRepository support.

## 0.9.1

### Patch Changes

- 81beb57: Fix HelmRelease.getChartName() to support chartRef pattern for OCIRepository-based charts.

## 0.9.0

### Minor Changes

- edee516: Add dynamic API version discovery for Kubernetes resources
  - Add useApiDiscovery hooks to automatically detect supported API versions
  - Support multi-version resources with `supportedVersions` array on KubeObject classes
  - Add version utilities for comparing and selecting preferred API versions
  - Improve resource fetching to use cluster-supported versions

### Patch Changes

- edee516: Move Sentry API version issue reporting into useResource and useResources hooks
  - Add automatic `useReportApiVersionIssues` call inside `useResource` and `useResources` hooks
  - Expose `clientOutdated` from `useResource` return value for consistency
  - Developers no longer need to manually call `useReportApiVersionIssues` when using these hooks

- edee516: Handle missing namespace in TypedLocalObjectReference for CAPI v1beta2
  - Update Cluster.getInfrastructureRef() and getControlPlaneRef() to handle both v1beta1 ObjectReference and v1beta2 TypedLocalObjectReference formats
  - Update ProviderCluster.getIdentityRef() with the same namespace fallback pattern
  - Include apiGroup in returned refs for proper resource matching with findResourceByRef()
  - When namespace is missing from a reference, fall back to the parent resource's namespace

- edee516: Integrate API version incompatibility errors into the error display system
  - Add IncompatibilityErrorInfo type and ErrorInfoUnion discriminated union
  - Update useShowErrors to handle both regular fetch errors and incompatibility errors
  - Include incompatibilities in errors array from useResource and useResources hooks
  - Add IncompatibilityPanel component for displaying incompatibility details
  - Move getIncompatibilityMessage and getErrorMessage helpers to kubernetes-react

## 0.8.2

### Patch Changes

- 40626f8: Fix the issue in the ErrorsProvider component that was causing constant re-renders.

## 0.8.1

### Patch Changes

- Updated dependencies [7f837a5]
  - @giantswarm/backstage-plugin-ui-react@0.7.0

## 0.8.0

### Minor Changes

- d6b1c2d: Use types from @giantswarm/k8s-types package.

## 0.7.1

### Patch Changes

- f4d5ed5: Fix MultipleClusterPicker to take disabled installations into account.

## 0.7.0

### Minor Changes

- 644308d: Handle rejected cluster authentication.

## 0.6.1

### Patch Changes

- f740242: Added support for API version v2 of HelmRelease

## 0.6.0

### Minor Changes

- 3b06846: Update Backstage to v1.43.

### Patch Changes

- Updated dependencies [3b06846]
  - @giantswarm/backstage-plugin-ui-react@0.6.0

## 0.5.1

### Patch Changes

- 212cfcb: Code clean-up and refactoring.
- 212cfcb: Switched from standard QueryClientProvider to PersistQueryClientProvider.

## 0.5.0

### Minor Changes

- f206288: Added Flux status card.

### Patch Changes

- Updated dependencies [f206288]
  - @giantswarm/backstage-plugin-ui-react@0.5.0

## 0.4.0

### Minor Changes

- 9e6fe22: Add table view for Flux resources.

### Patch Changes

- Updated dependencies [9e6fe22]
  - @giantswarm/backstage-plugin-ui-react@0.4.0

## 0.3.2

### Patch Changes

- 791a215: Fixed Cluster selectors when only one cluster is configured.

## 0.3.1

### Patch Changes

- fbc1589: Fallback to the old local storage key for selected Kubernetes clusters.

## 0.3.0

### Minor Changes

- 043fa87: Use filters layout for Flux overview UI.

### Patch Changes

- Updated dependencies [043fa87]
  - @giantswarm/backstage-plugin-ui-react@0.3.0

## 0.2.0

### Minor Changes

- 8685deb: Added Flux overview UI.

### Patch Changes

- Updated dependencies [8685deb]
  - @giantswarm/backstage-plugin-ui-react@0.2.0
