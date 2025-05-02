# @giantswarm/backstage-plugin-gs-common

## 0.16.0

### Minor Changes

- df8b489: Added Cloud Director support.

## 0.15.0

### Minor Changes

- 09bae90: Updated Backstage packages to v1.38.1.
- d121c2e: Updated dependencies.

## 0.14.0

### Minor Changes

- 93f0340: Added GitOps indicator to the Deployment details pane.

## 0.13.0

### Minor Changes

- 1aad32a: Handle cluster creation state.
- 1aad32a: Added custom scaffolder action to apply manifest to a cluster.
- 1aad32a: Added InstallationPicker, OrganizationPicker, ReleasePicker scaffolder fields.

## 0.12.0

### Minor Changes

- f42edd2: Updated Backstage to v1.37.0.

## 0.11.0

### Minor Changes

- 6ed2cbb: Made GitOps indicator link configurable via app configuration.

## 0.10.0

### Minor Changes

- 9e6f3c1: Backstage was updated to v1.36.1.

### Patch Changes

- f99862c: Refactored how GS Kubernetes API is used.
- c5d9972: Enable default auth policy.
- e06b6cd: Update dependencies.
- f99862c: Refactored data fetching hooks to share common logic.

## 0.9.0

### Minor Changes

- d5e7820: Added "Managed through GitOps" indicator to cluster details.

## 0.8.1

### Patch Changes

- 0b15773: Fixed how cluster type is determined for deployments.

## 0.8.0

### Minor Changes

- 60cf504: Split SOURCE column in deployments table into SOURCE and CHART NAME.
- 60cf504: Fixed missing values in CLUSTER column in deployments list.
- 60cf504: Added links to cluster details from deployments table and deployment details pane.
- 60cf504: Added CLUSTER TYPE column to deployments list.

## 0.7.3

### Patch Changes

- b5f0dcb: Changed AWS ACCOUNT ID column in clusters list to display value with color hashing and link to AWS account.
- 055dcb4: Changed CLUSTER APP column in clusters list to display provider specific cluster app version.

## 0.7.2

### Patch Changes

- e671231: Fetch only supported infrastructure cluster identity resources.

## 0.7.1

### Patch Changes

- 9243e49: Fetch infrastructure cluster resources only for supported providers.

## 0.7.0

### Minor Changes

- 20eab6a: Added column AWS ACCOUNT ID to clusters list
- 20eab6a: Added column LOCATION to clusters list

## 0.6.0

### Minor Changes

- ca553ba: Update Backstage packages to v1.34.2

## 0.5.0

### Minor Changes

- 3cd9851: Update dependencies.
- cebd404: Update Backstage to v1.33.5.

## 0.4.0

### Minor Changes

- f508faf: Update Backstage packages to v1.32.5.

## 0.3.0

### Minor Changes

- 291a42f: Add script to autogenerate TypeScript types for K8s resources.
- 291a42f: Refactor K8s resources management.

## 0.2.0

### Minor Changes

- b2b5cce: Update Backstage packages to v1.31.3
- 9aaa464: GS plugins were renamed in preparation to publish them.
