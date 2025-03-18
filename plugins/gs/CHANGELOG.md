# @giantswarm/backstage-plugin-gs

## 0.16.0

### Minor Changes

- 733fcf7: Used layout with facet filters on clusters and deployments pages.

## 0.15.1

### Patch Changes

- 3196e83: Made sorting by version column behave semver-aware.

## 0.15.0

### Minor Changes

- d431e37: On installations details, show custom CA info and non-standard access docs
- 6ed2cbb: Made GitOps indicator link configurable via app configuration.

### Patch Changes

- Updated dependencies [6ed2cbb]
  - @giantswarm/backstage-plugin-gs-common@0.11.0

## 0.14.0

### Minor Changes

- 9e6f3c1: Backstage was updated to v1.36.1.

### Patch Changes

- f99862c: Refactored how GS Kubernetes API is used.
- c5d9972: Enable default auth policy.
- e06b6cd: Update dependencies.
- f99862c: Refactored data fetching hooks to share common logic.
- Updated dependencies [f99862c]
- Updated dependencies [9e6f3c1]
- Updated dependencies [c5d9972]
- Updated dependencies [e06b6cd]
- Updated dependencies [f99862c]
  - @giantswarm/backstage-plugin-gs-common@0.10.0

## 0.13.0

### Minor Changes

- d5e7820: Added "Managed through GitOps" indicator to cluster details.

### Patch Changes

- Updated dependencies [d5e7820]
  - @giantswarm/backstage-plugin-gs-common@0.9.0

## 0.12.1

### Patch Changes

- 1ba6a38: Changed deployments table page size to 50. Allowed to change to 100.
- 1ba6a38: Sorted deployments table by name on initial render.
- e08db30: Changed Grafana link on cluster details page.
- 0b15773: Fixed how cluster type is determined for deployments.
- Updated dependencies [0b15773]
  - @giantswarm/backstage-plugin-gs-common@0.8.1

## 0.12.0

### Minor Changes

- 60cf504: Split SOURCE column in deployments table into SOURCE and CHART NAME.
- 60cf504: Split NAMESPACE/NAME column in deployments table into two separate columns.
- 60cf504: Fixed missing values in CLUSTER column in deployments list.
- 60cf504: Added deployments page.
- 60cf504: Added links to cluster details from deployments table and deployment details pane.
- 60cf504: Added CLUSTER TYPE column to deployments list.

### Patch Changes

- c9d0eb6: Change grouping of AWS account ID into groups of four digits
- Updated dependencies [60cf504]
- Updated dependencies [60cf504]
- Updated dependencies [60cf504]
- Updated dependencies [60cf504]
  - @giantswarm/backstage-plugin-gs-common@0.8.0

## 0.11.0

### Minor Changes

- 46fdee2: Added column KUBERNETES VERSION to clusters list.

### Patch Changes

- b5f0dcb: Changed AWS ACCOUNT ID column in clusters list to display value with color hashing and link to AWS account.
- 055dcb4: Changed CLUSTER APP column in clusters list to display provider specific cluster app version.
- Updated dependencies [b5f0dcb]
- Updated dependencies [055dcb4]
  - @giantswarm/backstage-plugin-gs-common@0.7.3

## 0.10.2

### Patch Changes

- e671231: Fetch only supported infrastructure cluster identity resources.
- Updated dependencies [e671231]
  - @giantswarm/backstage-plugin-gs-common@0.7.2

## 0.10.1

### Patch Changes

- 9243e49: Fetch infrastructure cluster resources only for supported providers.
- Updated dependencies [9243e49]
  - @giantswarm/backstage-plugin-gs-common@0.7.1

## 0.10.0

### Minor Changes

- 219004e: Add RELEASE column to clusters list
- 20eab6a: Added column AWS ACCOUNT ID to clusters list
- 20eab6a: Added column LOCATION to clusters list

### Patch Changes

- Updated dependencies [20eab6a]
- Updated dependencies [20eab6a]
  - @giantswarm/backstage-plugin-gs-common@0.7.0

## 0.9.0

### Minor Changes

- 0bfc102: Change TYPE column in clusters list view to show management/workload cluster icon
- 9c0d7ac: Added column CLUSTER APP to clusters list

## 0.8.0

### Minor Changes

- d9b40c8: Add configurable home page.

### Patch Changes

- 3306938: On the cluster details page, move the information about the installation from a dedicated widget into the About widget.

## 0.7.0

### Minor Changes

- ca553ba: Update Backstage packages to v1.34.2
- 85e6de9: Add links to Grafana and Web UI to cluster details page.

### Patch Changes

- 5b4002d: Remove 'vintage' from 'Cloud Director vintage' provider label
- Updated dependencies [ca553ba]
  - @giantswarm/backstage-plugin-gs-common@0.6.0

## 0.6.0

### Minor Changes

- 3d05628: Use Dex authentication provider for user sign-in.

## 0.5.0

### Minor Changes

- 3cd9851: Update dependencies.
- cebd404: Update Backstage to v1.33.5.

### Patch Changes

- Updated dependencies [3cd9851]
- Updated dependencies [cebd404]
  - @giantswarm/backstage-plugin-gs-common@0.5.0

## 0.4.0

### Minor Changes

- f508faf: Update Backstage packages to v1.32.5.
- 06092e9: Add custom Kubernetes and KubernetesAuthProviders APIs to communicate with Kubernetes clusters from client side.
- 06092e9: Add custom OAuth2 implementation for client side OIDC auth providers.

### Patch Changes

- Updated dependencies [f508faf]
  - @giantswarm/backstage-plugin-gs-common@0.4.0

## 0.3.3

### Patch Changes

- e1446d5: Fix Grafana dashboard link for deployment by using "default" for namespace variable.

## 0.3.2

### Patch Changes

- 607bb9a: Fix Grafana dashboard link for deployment by removing "default-" prefix from application name and adding a namespace variable.

## 0.3.1

### Patch Changes

- 06c9efc: Fix how GS users are distinguished from customer users.

## 0.3.0

### Minor Changes

- 291a42f: Refactor K8s resources management.
- 291a42f: Add cluster details page.

### Patch Changes

- e35602f: Add `--auth` flag to first time Teleport (tsh) login command
- Updated dependencies [291a42f]
- Updated dependencies [291a42f]
  - @giantswarm/backstage-plugin-gs-common@0.3.0

## 0.2.0

### Minor Changes

- b2b5cce: Update Backstage packages to v1.31.3
- 9aaa464: GS plugins were renamed in preparation to publish them.

### Patch Changes

- Updated dependencies [b2b5cce]
- Updated dependencies [9aaa464]
  - @giantswarm/backstage-plugin-gs-common@0.2.0
