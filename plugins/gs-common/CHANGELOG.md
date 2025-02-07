# @giantswarm/backstage-plugin-gs-common

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
