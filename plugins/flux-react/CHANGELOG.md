# @giantswarm/backstage-plugin-flux-react

## 0.9.0

### Minor Changes

- 8e3e4a4: Enhance Flux details panel with additional metadata
  - Add creation timestamp, interval, and resource-specific metadata to details panel and list view
  - Extract `findHelmReleaseChartName` utility into flux-react for shared use
  - Add convenience accessors to HelmRelease, GitRepository, OCIRepository, and HelmRepository resource classes

### Patch Changes

- Updated dependencies [23e9f63]
- Updated dependencies [8e3e4a4]
- Updated dependencies [8e3e4a4]
  - @giantswarm/backstage-plugin-kubernetes-react@0.11.0

## 0.8.0

### Minor Changes

- 3e3dd4c: Add support for ImageRepository, ImagePolicy, and ImageUpdateAutomation

### Patch Changes

- Updated dependencies [b4b5fc2]
- Updated dependencies [3e3dd4c]
  - @giantswarm/backstage-plugin-kubernetes-react@0.10.0

## 0.7.1

### Patch Changes

- edee516: Integrate API version incompatibility errors into the error display system
  - Add IncompatibilityErrorInfo type and ErrorInfoUnion discriminated union
  - Update useShowErrors to handle both regular fetch errors and incompatibility errors
  - Include incompatibilities in errors array from useResource and useResources hooks
  - Add IncompatibilityPanel component for displaying incompatibility details
  - Move getIncompatibilityMessage and getErrorMessage helpers to kubernetes-react

- Updated dependencies [edee516]
- Updated dependencies [edee516]
- Updated dependencies [edee516]
- Updated dependencies [edee516]
  - @giantswarm/backstage-plugin-kubernetes-react@0.9.0

## 0.7.0

### Minor Changes

- 009baf6: Add search widget to Flux Tree view

## 0.6.3

### Patch Changes

- 578b11d: Show details for GitRepository, OCIRepository, HelmRepository

## 0.6.2

### Patch Changes

- Updated dependencies [7f837a5]
  - @giantswarm/backstage-plugin-ui-react@0.7.0
  - @giantswarm/backstage-plugin-kubernetes-react@0.8.1

## 0.6.1

### Patch Changes

- Updated dependencies [d6b1c2d]
  - @giantswarm/backstage-plugin-kubernetes-react@0.8.0

## 0.6.0

### Minor Changes

- 644308d: Handle rejected cluster authentication.

### Patch Changes

- Updated dependencies [644308d]
  - @giantswarm/backstage-plugin-kubernetes-react@0.7.0

## 0.5.6

### Patch Changes

- f740242: Added support for API version v2 of HelmRelease
- Updated dependencies [f740242]
  - @giantswarm/backstage-plugin-kubernetes-react@0.6.1

## 0.5.5

### Patch Changes

- 1f347ff: Aligned pagination size options between tables.
- 1f347ff: Change status picker in Flux UI to display static list of options.
- 1f347ff: Added source cluster column to the Flux UI resources table.
- Updated dependencies [1f347ff]
  - @giantswarm/backstage-plugin-ui-react@0.6.1

## 0.5.4

### Patch Changes

- c930bcf: Fixed Flux resources refetching when some clusters authentication is canceled by a user.
- Updated dependencies [3b06846]
  - @giantswarm/backstage-plugin-kubernetes-react@0.6.0
  - @giantswarm/backstage-plugin-ui-react@0.6.0

## 0.5.3

### Patch Changes

- 212cfcb: Code clean-up and refactoring.
- 212cfcb: Switched from standard QueryClientProvider to PersistQueryClientProvider.
- Updated dependencies [212cfcb]
- Updated dependencies [212cfcb]
  - @giantswarm/backstage-plugin-kubernetes-react@0.5.1

## 0.5.2

### Patch Changes

- 3030f54: Fixed Flux resources table sorting.
- Updated dependencies [3030f54]
  - @giantswarm/backstage-plugin-ui-react@0.5.1

## 0.5.1

### Patch Changes

- 34f5aba: Fixed version in the Flux status widget.

## 0.5.0

### Minor Changes

- f206288: Added Flux status card.

### Patch Changes

- Updated dependencies [f206288]
  - @giantswarm/backstage-plugin-kubernetes-react@0.5.0
  - @giantswarm/backstage-plugin-ui-react@0.5.0

## 0.4.0

### Minor Changes

- 9e6fe22: Add table view for Flux resources.

### Patch Changes

- Updated dependencies [9e6fe22]
  - @giantswarm/backstage-plugin-kubernetes-react@0.4.0
  - @giantswarm/backstage-plugin-ui-react@0.4.0

## 0.3.1

### Patch Changes

- 3ce1520: Changed ordering for resources in the Flux overview tree.
- c585a66: Reordered sections in the Flux resource details panel.

## 0.3.0

### Minor Changes

- 043fa87: Use filters layout for Flux overview UI.

### Patch Changes

- Updated dependencies [043fa87]
  - @giantswarm/backstage-plugin-kubernetes-react@0.3.0
  - @giantswarm/backstage-plugin-ui-react@0.3.0

## 0.2.0

### Minor Changes

- 8685deb: Added Flux overview UI.
