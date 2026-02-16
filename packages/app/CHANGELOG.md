# app

## 0.30.0

### Minor Changes

- f09f501: Migrate flux plugin to New Frontend System
- f09f501: Convert app shell to New Frontend System hybrid mode

### Patch Changes

- f09f501: Migrate ai-chat plugin to New Frontend System
- Updated dependencies [f09f501]
- Updated dependencies [f09f501]
  - @giantswarm/backstage-plugin-flux@0.7.0
  - @giantswarm/backstage-plugin-ai-chat@0.6.0
  - @giantswarm/backstage-plugin-gs@0.53.5

## 0.29.0

### Minor Changes

- 7c1ad33: Replace TelemetryProvider with standard Backstage AnalyticsApi implementation for TelemetryDeck

### Patch Changes

- 7c1ad33: Add missing pages to telemetry tracking (Home, Catalog graph, Deployment details, Flux, AI Chat)
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

- c77afe4: Report "Unknown page" telemetry events as warnings via errorReporterApi so they surface in Sentry
- Updated dependencies [23e9f63]
- Updated dependencies [8e3e4a4]
- Updated dependencies [4166fda]
- Updated dependencies [8e3e4a4]
  - @giantswarm/backstage-plugin-error-reporter-react@0.2.0
  - @giantswarm/backstage-plugin-kubernetes-react@0.11.0
  - @giantswarm/backstage-plugin-gs@0.53.3
  - @giantswarm/backstage-plugin-flux@0.6.8

## 0.28.1

### Patch Changes

- Updated dependencies [b4b5fc2]
- Updated dependencies [3e3dd4c]
  - @giantswarm/backstage-plugin-kubernetes-react@0.10.0
  - @giantswarm/backstage-plugin-flux@0.6.7
  - @giantswarm/backstage-plugin-gs@0.53.1

## 0.28.0

### Minor Changes

- 7cc2c17: Show icon for entities if giantswarm.io/icon-url annotation is given

### Patch Changes

- Updated dependencies [7cc2c17]
  - @giantswarm/backstage-plugin-gs@0.53.0

## 0.27.0

### Minor Changes

- 2efe3a2: Update Backstage from 1.43.3 to 1.47.3. This update includes new features and improvements from Backstage releases 1.44 through 1.47, including Node.js 22/24 support, Jest 30 compatibility, and various plugin updates.
- 470fceb: Add ability to render APIs of type CRD

## 0.26.3

### Patch Changes

- Updated dependencies [a68a2b2]
- Updated dependencies [d070c3a]
- Updated dependencies [d4b1b9a]
- Updated dependencies [a68a2b2]
  - @giantswarm/backstage-plugin-ai-chat@0.5.0
  - @giantswarm/backstage-plugin-gs@0.52.0

## 0.26.2

### Patch Changes

- Updated dependencies [edee516]
- Updated dependencies [edee516]
- Updated dependencies [edee516]
- Updated dependencies [edee516]
- Updated dependencies [edee516]
- Updated dependencies [edee516]
  - @giantswarm/backstage-plugin-kubernetes-react@0.9.0
  - @giantswarm/backstage-plugin-gs@0.51.5
  - @giantswarm/backstage-plugin-flux@0.6.6

## 0.26.1

### Patch Changes

- Updated dependencies [9fb2244]
- Updated dependencies [31207f3]
- Updated dependencies [ccaf194]
- Updated dependencies [5475c38]
- Updated dependencies [13198eb]
  - @giantswarm/backstage-plugin-gs@0.51.4
  - @giantswarm/backstage-plugin-ai-chat@0.4.0

## 0.26.0

### Minor Changes

- 0384d69: Update ai-sdk packages to v6

### Patch Changes

- Updated dependencies [0384d69]
- Updated dependencies [98f9ffb]
- Updated dependencies [98f9ffb]
- Updated dependencies [009baf6]
  - @giantswarm/backstage-plugin-ai-chat@0.3.0
  - @giantswarm/backstage-plugin-gs@0.51.3
  - @giantswarm/backstage-plugin-flux@0.6.5

## 0.25.1

### Patch Changes

- c9d05b5: Fix react-router version mismatch that caused "useRoutes() may be used only in the context of a Router component" error on Entity pages

## 0.25.0

### Minor Changes

- 1a75706: Add AI Chat plugin.

### Patch Changes

- Updated dependencies [1a75706]
  - @giantswarm/backstage-plugin-ai-chat@0.2.0

## 0.24.0

### Minor Changes

- 4fd2838: Add Helm chart readme overview.

### Patch Changes

- Updated dependencies [4fd2838]
  - @giantswarm/backstage-plugin-gs@0.51.0

## 0.23.0

### Minor Changes

- f665c62: Add Helm chart versions history.

### Patch Changes

- Updated dependencies [f665c62]
- Updated dependencies [f665c62]
  - @giantswarm/backstage-plugin-gs@0.50.0

## 0.22.7

### Patch Changes

- 590fcac: Fix syntax highlighting in the YamlEditor component.
- Updated dependencies [2dfca83]
  - @giantswarm/backstage-plugin-gs@0.49.1

## 0.22.6

### Patch Changes

- b2d62f8: Allow to install only deployable applications.
- Updated dependencies [8812d57]
- Updated dependencies [39eb4f8]
  - @giantswarm/backstage-plugin-gs@0.49.0

## 0.22.5

### Patch Changes

- Updated dependencies [5e8c7e3]
  - @giantswarm/backstage-plugin-gs@0.48.0

## 0.22.4

### Patch Changes

- Updated dependencies [7f837a5]
- Updated dependencies [7f837a5]
- Updated dependencies [7f837a5]
- Updated dependencies [7f837a5]
- Updated dependencies [7f837a5]
- Updated dependencies [7f837a5]
  - @giantswarm/backstage-plugin-gs@0.47.0
  - @giantswarm/backstage-plugin-flux@0.6.3

## 0.22.3

### Patch Changes

- Updated dependencies [a478023]
- Updated dependencies [a478023]
  - @giantswarm/backstage-plugin-gs@0.46.0

## 0.22.2

### Patch Changes

- Updated dependencies [d6b1c2d]
- Updated dependencies [d6b1c2d]
  - @giantswarm/backstage-plugin-gs@0.45.0
  - @giantswarm/backstage-plugin-flux@0.6.2

## 0.22.1

### Patch Changes

- Updated dependencies [644308d]
  - @giantswarm/backstage-plugin-gs@0.44.0
  - @giantswarm/backstage-plugin-flux@0.6.1

## 0.22.0

### Minor Changes

- 1f347ff: Changed Flux UI default view to resources overview.

### Patch Changes

- Updated dependencies [1f347ff]
- Updated dependencies [1f347ff]
  - @giantswarm/backstage-plugin-flux@0.6.0
  - @giantswarm/backstage-plugin-gs@0.43.0

## 0.21.0

### Minor Changes

- 3b06846: Update Backstage to v1.43.

### Patch Changes

- @giantswarm/backstage-plugin-flux@0.5.2
- @giantswarm/backstage-plugin-gs@0.42.3

## 0.20.1

### Patch Changes

- 212cfcb: Code clean-up and refactoring.
- 212cfcb: Switched from standard QueryClientProvider to PersistQueryClientProvider.
- 1cf23cb: Removal of the Quay plugin
- Updated dependencies [212cfcb]
- Updated dependencies [212cfcb]
  - @giantswarm/backstage-plugin-flux@0.5.1
  - @giantswarm/backstage-plugin-gs@0.42.2

## 0.20.0

### Minor Changes

- f206288: Added Flux status card.

### Patch Changes

- Updated dependencies [f206288]
  - @giantswarm/backstage-plugin-flux@0.5.0
  - @giantswarm/backstage-plugin-gs@0.42.0

## 0.19.1

### Patch Changes

- Updated dependencies [9e6fe22]
  - @giantswarm/backstage-plugin-flux@0.4.0
  - @giantswarm/backstage-plugin-gs@0.41.0

## 0.19.0

### Minor Changes

- 043fa87: Use filters layout for Flux overview UI.

### Patch Changes

- Updated dependencies [043fa87]
  - @giantswarm/backstage-plugin-flux@0.3.0
  - @giantswarm/backstage-plugin-gs@0.40.0

## 0.18.0

### Minor Changes

- 8685deb: Added Flux overview UI.

### Patch Changes

- Updated dependencies [cbdf4f6]
- Updated dependencies [8685deb]
  - @giantswarm/backstage-plugin-gs@0.39.0
  - @giantswarm/backstage-plugin-flux@0.2.0

## 0.17.1

### Patch Changes

- 55b7f9b: Fixed catalog routing issue.
- Updated dependencies [b2171b9]
  - @giantswarm/backstage-plugin-gs@0.38.1

## 0.17.0

### Minor Changes

- 2294710: Updated Backstage to v1.40.1.

### Patch Changes

- dc8295d: Fixed catalog routing.
- Updated dependencies [b4f69e9]
- Updated dependencies [2294710]
  - @giantswarm/backstage-plugin-gs@0.38.0

## 0.16.5

### Patch Changes

- Updated dependencies [46ae127]
- Updated dependencies [7307756]
  - @giantswarm/backstage-plugin-gs@0.37.0

## 0.16.4

### Patch Changes

- Updated dependencies [7eb690b]
  - @giantswarm/backstage-plugin-gs@0.36.0

## 0.16.3

### Patch Changes

- Updated dependencies [bb84af1]
  - @giantswarm/backstage-plugin-gs@0.35.0

## 0.16.2

### Patch Changes

- Updated dependencies [8378d2a]
- Updated dependencies [8378d2a]
  - @giantswarm/backstage-plugin-gs@0.34.0

## 0.16.1

### Patch Changes

- Updated dependencies [5ac83b5]
- Updated dependencies [32f30df]
  - @giantswarm/backstage-plugin-gs@0.33.0

## 0.16.0

### Minor Changes

- e9b3d0f: Use one GS context for the application.

### Patch Changes

- Updated dependencies [e9b3d0f]
- Updated dependencies [e9b3d0f]
  - @giantswarm/backstage-plugin-gs@0.32.0

## 0.15.1

### Patch Changes

- Updated dependencies [d37eb78]
  - @giantswarm/backstage-plugin-gs@0.31.0

## 0.15.0

### Minor Changes

- 4c21763: Added a custom scaffolder client to interact with headless backend instances.
- 4c21763: Added a custom discovery API to interact with headless backend instances.

### Patch Changes

- Updated dependencies [4c21763]
- Updated dependencies [4c21763]
  - @giantswarm/backstage-plugin-gs@0.30.0

## 0.14.1

### Patch Changes

- Updated dependencies [df8b489]
  - @giantswarm/backstage-plugin-gs@0.29.0

## 0.14.0

### Minor Changes

- c3eb724: Delegated unimplemented custom Kubernetes client methods to the standard Kubernetes backend client.

### Patch Changes

- Updated dependencies [c3eb724]
  - @giantswarm/backstage-plugin-gs@0.28.0

## 0.13.0

### Minor Changes

- 09bae90: Updated Backstage packages to v1.38.1.
- d121c2e: Updated dependencies.

### Patch Changes

- Updated dependencies [09bae90]
- Updated dependencies [d121c2e]
  - @giantswarm/backstage-plugin-gs@0.27.0

## 0.12.4

### Patch Changes

- Updated dependencies [0126c0d]
  - @giantswarm/backstage-plugin-gs@0.26.0

## 0.12.3

### Patch Changes

- Updated dependencies [763e8fb]
  - @giantswarm/backstage-plugin-gs@0.25.0

## 0.12.2

### Patch Changes

- Updated dependencies [8ff7d5d]
  - @giantswarm/backstage-plugin-gs@0.24.0

## 0.12.1

### Patch Changes

- 58db05e: Fixed how deployments entity content is displayed.
- Updated dependencies [8f11eb3]
- Updated dependencies [93f0340]
  - @giantswarm/backstage-plugin-gs@0.23.0

## 0.12.0

### Minor Changes

- f5731e5: Improved resource entity page layout

### Patch Changes

- Updated dependencies [3c16f4d]
  - @giantswarm/backstage-plugin-gs@0.22.1

## 0.11.3

### Patch Changes

- Updated dependencies [492699f]
- Updated dependencies [492699f]
- Updated dependencies [492699f]
  - @giantswarm/backstage-plugin-gs@0.22.0

## 0.11.2

### Patch Changes

- Updated dependencies [1731002]
- Updated dependencies [2e4b66f]
- Updated dependencies [c43b45a]
- Updated dependencies [e8062d0]
  - @giantswarm/backstage-plugin-gs@0.21.0

## 0.11.1

### Patch Changes

- Updated dependencies [8e45f1b]
- Updated dependencies [d95c4ea]
- Updated dependencies [6c9ae8d]
- Updated dependencies [0423b34]
- Updated dependencies [d95c4ea]
  - @giantswarm/backstage-plugin-gs@0.20.0

## 0.11.0

### Minor Changes

- 1aad32a: Handle cluster creation state.
- 1aad32a: Added custom scaffolder action to apply manifest to a cluster.
- 1aad32a: Added InstallationPicker, OrganizationPicker, ReleasePicker scaffolder fields.

### Patch Changes

- Updated dependencies [1aad32a]
- Updated dependencies [1aad32a]
- Updated dependencies [1aad32a]
  - @giantswarm/backstage-plugin-gs@0.19.0

## 0.10.0

### Minor Changes

- f42edd2: Updated Backstage to v1.37.0.

### Patch Changes

- Updated dependencies [f42edd2]
  - @giantswarm/backstage-plugin-gs@0.18.0

## 0.9.3

### Patch Changes

- bfc0a5f: Pinned dependency versions to fix error "useEntityList must be used within EntityListProvider"
- Updated dependencies [bfc0a5f]
  - @giantswarm/backstage-plugin-gs@0.17.3

## 0.9.2

### Patch Changes

- Updated dependencies [2e9eb19]
- Updated dependencies [2e9eb19]
- Updated dependencies [2e9eb19]
  - @giantswarm/backstage-plugin-gs@0.17.0

## 0.9.1

### Patch Changes

- Updated dependencies [733fcf7]
  - @giantswarm/backstage-plugin-gs@0.16.0

## 0.9.0

### Minor Changes

- d431e37: On installations details, show custom CA info and non-standard access docs

### Patch Changes

- Updated dependencies [d431e37]
- Updated dependencies [6ed2cbb]
  - @giantswarm/backstage-plugin-gs@0.15.0

## 0.8.0

### Minor Changes

- 9e6f3c1: Backstage was updated to v1.36.1.

### Patch Changes

- f99862c: Refactored how GS Kubernetes API is used.
- c5d9972: Enable default auth policy.
- e06b6cd: Update dependencies.
- Updated dependencies [f99862c]
- Updated dependencies [9e6f3c1]
- Updated dependencies [c5d9972]
- Updated dependencies [e06b6cd]
- Updated dependencies [f99862c]
  - @giantswarm/backstage-plugin-gs@0.14.0

## 0.7.1

### Patch Changes

- Updated dependencies [d5e7820]
  - @giantswarm/backstage-plugin-gs@0.13.0

## 0.7.0

### Minor Changes

- 60cf504: Added deployments page.

### Patch Changes

- Updated dependencies [60cf504]
- Updated dependencies [60cf504]
- Updated dependencies [60cf504]
- Updated dependencies [60cf504]
- Updated dependencies [c9d0eb6]
- Updated dependencies [60cf504]
- Updated dependencies [60cf504]
  - @giantswarm/backstage-plugin-gs@0.12.0

## 0.6.3

### Patch Changes

- Updated dependencies [b5f0dcb]
- Updated dependencies [46fdee2]
- Updated dependencies [055dcb4]
  - @giantswarm/backstage-plugin-gs@0.11.0

## 0.6.2

### Patch Changes

- Updated dependencies [219004e]
- Updated dependencies [20eab6a]
- Updated dependencies [20eab6a]
  - @giantswarm/backstage-plugin-gs@0.10.0

## 0.6.1

### Patch Changes

- Updated dependencies [0bfc102]
- Updated dependencies [9c0d7ac]
  - @giantswarm/backstage-plugin-gs@0.9.0

## 0.6.0

### Minor Changes

- d9b40c8: Add configurable home page.

### Patch Changes

- Updated dependencies [3306938]
- Updated dependencies [d9b40c8]
  - @giantswarm/backstage-plugin-gs@0.8.0

## 0.5.0

### Minor Changes

- ca553ba: Update Backstage packages to v1.34.2

### Patch Changes

- Updated dependencies [ca553ba]
- Updated dependencies [5b4002d]
- Updated dependencies [85e6de9]
  - @giantswarm/backstage-plugin-gs@0.7.0

## 0.4.1

### Patch Changes

- 5939854: Fix telemetry user reference for guest users.

## 0.4.0

### Minor Changes

- 3d05628: Use Dex authentication provider for user sign-in.

### Patch Changes

- Updated dependencies [3d05628]
  - @giantswarm/backstage-plugin-gs@0.6.0

## 0.3.0

### Minor Changes

- 3cd9851: Update dependencies.
- cebd404: Update Backstage to v1.33.5.

### Patch Changes

- Updated dependencies [3cd9851]
- Updated dependencies [cebd404]
  - @giantswarm/backstage-plugin-gs@0.5.0

## 0.2.0

### Minor Changes

- f508faf: Update Backstage packages to v1.32.5.
- 06092e9: Add custom Kubernetes and KubernetesAuthProviders APIs to communicate with Kubernetes clusters from client side.
- 06092e9: Add custom OAuth2 implementation for client side OIDC auth providers.

### Patch Changes

- Updated dependencies [f508faf]
- Updated dependencies [06092e9]
- Updated dependencies [06092e9]
  - @giantswarm/backstage-plugin-gs@0.4.0

## 0.1.2

### Patch Changes

- 06c9efc: Fix how GS users are distinguished from customer users.
- Updated dependencies [06c9efc]
  - @giantswarm/backstage-plugin-gs@0.3.1

## 0.1.1

### Patch Changes

- Updated dependencies [e35602f]
- Updated dependencies [291a42f]
- Updated dependencies [291a42f]
  - @giantswarm/backstage-plugin-gs@0.3.0

## 0.1.0

### Minor Changes

- 5c59bf1: Add usage tracking with TelemetryDeck.
- b2b5cce: Update Backstage packages to v1.31.3
- 9aaa464: GS plugins were renamed in preparation to publish them.

### Patch Changes

- Updated dependencies [b2b5cce]
- Updated dependencies [9aaa464]
  - @giantswarm/backstage-plugin-gs@0.2.0
