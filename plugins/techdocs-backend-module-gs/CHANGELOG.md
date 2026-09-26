# @giantswarm/backstage-plugin-techdocs-backend-module-gs

## 0.10.1

### Patch Changes

- 6662c03: TechDocs builds no longer fail for a repository whose `docs` folder holds no
  Markdown file.

  The preparer moved every `docs` folder into a `docs-component` sub-directory for
  mkdocs-monorepo-plugin, and wrote a fallback `mkdocs.yaml` without a `nav` key.
  mkdocs-monorepo-plugin scaffolds that missing `nav` from the Markdown files in
  the folder, so an asset-only folder produced an empty nav and the build aborted
  with "does not contain a valid 'nav' key". A `docs` folder without Markdown
  files now becomes `docs/docs` inside the generated docs root instead, which
  keeps its assets reachable under the path that relative links from the
  repository root use.

## 0.10.0

### Minor Changes

- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.

## 0.9.0

### Minor Changes

- 2294710: Updated Backstage to v1.40.1.

## 0.8.0

### Minor Changes

- 09bae90: Updated Backstage packages to v1.38.1.
- d121c2e: Updated dependencies.

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
