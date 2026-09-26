# @giantswarm/backstage-plugin-flux

## 0.10.0

### Minor Changes

- b2c5996: Roll up failing descendant status in the Flux resources tree and add a "Failing only" status filter. Parent nodes now show a warning indicator when any resource beneath them has `Ready=False` (visible while collapsed), and the new Status filter prunes the tree to only the paths that lead to failing resources — the UI equivalent of `flux get kustomizations --status-selector ready=false`.

### Patch Changes

- c81464c: Give each plugin's persisted react-query cache its own localStorage key, with a
  size guard.

  The gs, flux and agent-platform `QueryClientProvider`s all persisted under the
  library's default key `REACT_QUERY_OFFLINE_CACHE`. Every client rehydrated the
  others' entries on restore and wrote them back on its next save, so the three
  caches merged into one blob — 4.9 MB on the Dev Portal, 3.6 MB of it flux
  Kustomization lists — against a per-origin localStorage budget of roughly 5 MB,
  where one quota error would have silently ended persistence for all of them.

  - `kubernetes-react`: new `createPluginQueryPersister({ key, throttleTime?, maxChars? })`.
    Writes under the plugin's key, removes the legacy shared blob, keeps the
    persisted copy under 2 MB by leaving out the oldest queries first
    (`trimPersistedClient`), retries a quota error with the client halved, and
    reads garbage under the key as "nothing persisted" instead of an error per
    mount (`deserializePersistedClient`). The rule from #2264 stands: a new data
    shape needs a new _query_ key, and what is iterated from the cache is guarded.
  - `gs` persists under `gs-react-query-cache`, `agent-platform` under
    `agent-platform-react-query-cache`, `flux` under `flux-react-query-cache`.
    The first load after the upgrade refetches once; reloads after that rehydrate
    as before.

- Updated dependencies [6c096fb]
- Updated dependencies [5859267]
- Updated dependencies [d7b570d]
- Updated dependencies [e62dd24]
- Updated dependencies [2494c9a]
- Updated dependencies [85b1ac8]
- Updated dependencies [c5b9c46]
- Updated dependencies [1a05f26]
- Updated dependencies [7a49e7f]
- Updated dependencies [a036f84]
- Updated dependencies [a776d8b]
- Updated dependencies [5b5d408]
- Updated dependencies [d6bec76]
- Updated dependencies [c4f3eca]
- Updated dependencies [fedd5d8]
- Updated dependencies [281d787]
- Updated dependencies [ef01d42]
- Updated dependencies [9602074]
- Updated dependencies [d87fd9d]
- Updated dependencies [67a32ef]
- Updated dependencies [86eec55]
- Updated dependencies [23bfca0]
- Updated dependencies [87b1c2e]
- Updated dependencies [6822ed1]
- Updated dependencies [d29ac2a]
- Updated dependencies [573b34d]
- Updated dependencies [526dd01]
- Updated dependencies [2c383a6]
- Updated dependencies [b431a04]
- Updated dependencies [5c82125]
- Updated dependencies [c25dd0b]
- Updated dependencies [4f6d765]
- Updated dependencies [322e58c]
- Updated dependencies [b2c5996]
- Updated dependencies [94a61cb]
- Updated dependencies [c604256]
- Updated dependencies [6b3ac77]
- Updated dependencies [b8afa37]
- Updated dependencies [ca6ffd8]
- Updated dependencies [398c4b1]
- Updated dependencies [fd7799f]
- Updated dependencies [582faca]
- Updated dependencies [ce9e155]
- Updated dependencies [e8c6d73]
- Updated dependencies [c81464c]
- Updated dependencies [ba553f1]
- Updated dependencies [14e878c]
- Updated dependencies [14e878c]
- Updated dependencies [1893681]
- Updated dependencies [e807fa6]
- Updated dependencies [b097034]
- Updated dependencies [6e0bd9d]
- Updated dependencies [b9433d4]
- Updated dependencies [322e58c]
- Updated dependencies [b990251]
- Updated dependencies [9e57736]
- Updated dependencies [a8bb5a6]
- Updated dependencies [1ec7387]
- Updated dependencies [d63665c]
- Updated dependencies [6ce4a71]
- Updated dependencies [600a4c3]
- Updated dependencies [e6ced92]
  - @giantswarm/backstage-plugin-kubernetes-react@1.0.0
  - @giantswarm/backstage-plugin-ui-react@0.9.0
  - @giantswarm/backstage-plugin-flux-react@0.15.0

## 0.9.2

### Patch Changes

- 2ed9ab4: Flux tree view now fills the available viewport height with its own internal scrolling, instead of collapsing to the height of the filter column. The tree also sits flush against the right and bottom page edges, and the gap above it is reduced.
- Updated dependencies [2ed9ab4]
  - @giantswarm/backstage-plugin-flux-react@0.14.2

## 0.9.1

### Patch Changes

- Updated dependencies [865790a]
  - @giantswarm/backstage-plugin-kubernetes-react@0.16.0
  - @giantswarm/backstage-plugin-flux-react@0.14.1

## 0.9.0

### Minor Changes

- 6aea60f: Migrate the Clusters, Deployments, Installations, Catalog, and Flux pages to the new frontend system page header (rendered automatically from the page blueprint's title and icon), replacing the classic `Header`/`PageWithHeader` from `@backstage/core-components`.
  - The Flux page's "List view" and "Tree view" are now sub-pages, rendered as tabs in the page header. `/flux` redirects to `/flux/list`; the tree view remains at `/flux/tree`.
  - BREAKING (`@giantswarm/backstage-plugin-flux-react`): the `FluxPageLayout` component has been removed. `FluxListFilterBlueprint` and `FluxTreeFilterBlueprint` extensions now attach to `sub-page:flux/list` and `sub-page:flux/tree` (input `filters`) instead of `page:flux`.
  - The page subtitles on the Clusters and Deployments pages have been dropped, as the new header does not support subtitles.
  - The catalog page title no longer includes the organization name (`organization.name` config); it is now just "Catalog". Installations can override it via app-config: `app.extensions` → `page:catalog` → `config.title`.
  - The `SupportButton` on the Catalog and Installations pages has been removed, as the new header has no place for it.

### Patch Changes

- Updated dependencies [6aea60f]
  - @giantswarm/backstage-plugin-flux-react@0.14.0

## 0.8.3

### Patch Changes

- Updated dependencies [b928d80]
- Updated dependencies [b928d80]
- Updated dependencies [8a1fbdc]
  - @giantswarm/backstage-plugin-ui-react@0.8.4
  - @giantswarm/backstage-plugin-kubernetes-react@0.15.0
  - @giantswarm/backstage-plugin-flux-react@0.13.2

## 0.8.2

### Patch Changes

- Updated dependencies [0860ea0]
- Updated dependencies [c06f5bf]
- Updated dependencies [b5802af]
- Updated dependencies [c06f5bf]
- Updated dependencies [c06f5bf]
  - @giantswarm/backstage-plugin-flux-react@0.13.0
  - @giantswarm/backstage-plugin-kubernetes-react@0.14.1
  - @giantswarm/backstage-plugin-ui-react@0.8.2

## 0.8.1

### Patch Changes

- Updated dependencies [9997d4a]
  - @giantswarm/backstage-plugin-kubernetes-react@0.14.0
  - @giantswarm/backstage-plugin-flux-react@0.12.1

## 0.8.0

### Minor Changes

- 915083b: Replace GSFeatureEnabled with NFS config-based extension toggling. Page and nav-item blueprints are now disabled by default and enabled via `app.extensions` in app-config.yaml. Delete FeatureEnabled and MainMenu components from gs plugin.
- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.

### Patch Changes

- Updated dependencies [668ab64]
- Updated dependencies [ebd466f]
  - @giantswarm/backstage-plugin-flux-react@0.12.0
  - @giantswarm/backstage-plugin-kubernetes-react@0.13.0
  - @giantswarm/backstage-plugin-ui-react@0.8.0

## 0.7.2

### Patch Changes

- Updated dependencies [dde73a8]
  - @giantswarm/backstage-plugin-kubernetes-react@0.12.0
  - @giantswarm/backstage-plugin-flux-react@0.11.1

## 0.7.1

### Patch Changes

- Updated dependencies [24c279b]
- Updated dependencies [d3fd8a5]
  - @giantswarm/backstage-plugin-ui-react@0.7.3
  - @giantswarm/backstage-plugin-flux-react@0.11.0

## 0.7.0

### Minor Changes

- f09f501: Migrate flux plugin to New Frontend System

## 0.6.9

### Patch Changes

- Updated dependencies [b1b1b7a]
- Updated dependencies [b1b1b7a]
- Updated dependencies [b1b1b7a]
- Updated dependencies [cd3f13e]
- Updated dependencies [b1b1b7a]
- Updated dependencies [b1b1b7a]
- Updated dependencies [cd3f13e]
- Updated dependencies [134df14]
  - @giantswarm/backstage-plugin-ui-react@0.7.2
  - @giantswarm/backstage-plugin-flux-react@0.10.0
  - @giantswarm/backstage-plugin-kubernetes-react@0.11.1

## 0.6.8

### Patch Changes

- Updated dependencies [23e9f63]
- Updated dependencies [8e3e4a4]
- Updated dependencies [8e3e4a4]
  - @giantswarm/backstage-plugin-kubernetes-react@0.11.0
  - @giantswarm/backstage-plugin-flux-react@0.9.0

## 0.6.7

### Patch Changes

- Updated dependencies [b4b5fc2]
- Updated dependencies [3e3dd4c]
- Updated dependencies [3e3dd4c]
  - @giantswarm/backstage-plugin-kubernetes-react@0.10.0
  - @giantswarm/backstage-plugin-flux-react@0.8.0

## 0.6.6

### Patch Changes

- Updated dependencies [edee516]
- Updated dependencies [edee516]
- Updated dependencies [edee516]
- Updated dependencies [edee516]
  - @giantswarm/backstage-plugin-kubernetes-react@0.9.0
  - @giantswarm/backstage-plugin-flux-react@0.7.1

## 0.6.5

### Patch Changes

- Updated dependencies [009baf6]
  - @giantswarm/backstage-plugin-flux-react@0.7.0

## 0.6.4

### Patch Changes

- f3f3a50: Consistent errors handling for chart tags requests.

## 0.6.3

### Patch Changes

- Updated dependencies [7f837a5]
  - @giantswarm/backstage-plugin-ui-react@0.7.0
  - @giantswarm/backstage-plugin-flux-react@0.6.2
  - @giantswarm/backstage-plugin-kubernetes-react@0.8.1

## 0.6.2

### Patch Changes

- Updated dependencies [d6b1c2d]
  - @giantswarm/backstage-plugin-kubernetes-react@0.8.0
  - @giantswarm/backstage-plugin-flux-react@0.6.1

## 0.6.1

### Patch Changes

- Updated dependencies [644308d]
  - @giantswarm/backstage-plugin-kubernetes-react@0.7.0
  - @giantswarm/backstage-plugin-flux-react@0.6.0

## 0.6.0

### Minor Changes

- 1f347ff: Changed Flux UI default view to resources overview.

### Patch Changes

- Updated dependencies [1f347ff]
- Updated dependencies [1f347ff]
- Updated dependencies [1f347ff]
- Updated dependencies [1f347ff]
  - @giantswarm/backstage-plugin-flux-react@0.5.5
  - @giantswarm/backstage-plugin-ui-react@0.6.1

## 0.5.2

### Patch Changes

- Updated dependencies [3b06846]
- Updated dependencies [c930bcf]
  - @giantswarm/backstage-plugin-kubernetes-react@0.6.0
  - @giantswarm/backstage-plugin-ui-react@0.6.0
  - @giantswarm/backstage-plugin-flux-react@0.5.4

## 0.5.1

### Patch Changes

- 212cfcb: Code clean-up and refactoring.
- 212cfcb: Switched from standard QueryClientProvider to PersistQueryClientProvider.
- Updated dependencies [212cfcb]
- Updated dependencies [212cfcb]
  - @giantswarm/backstage-plugin-kubernetes-react@0.5.1
  - @giantswarm/backstage-plugin-flux-react@0.5.3

## 0.5.0

### Minor Changes

- f206288: Added Flux status card.

### Patch Changes

- Updated dependencies [f206288]
  - @giantswarm/backstage-plugin-kubernetes-react@0.5.0
  - @giantswarm/backstage-plugin-flux-react@0.5.0
  - @giantswarm/backstage-plugin-ui-react@0.5.0

## 0.4.0

### Minor Changes

- 9e6fe22: Add table view for Flux resources.

### Patch Changes

- Updated dependencies [9e6fe22]
  - @giantswarm/backstage-plugin-kubernetes-react@0.4.0
  - @giantswarm/backstage-plugin-flux-react@0.4.0
  - @giantswarm/backstage-plugin-ui-react@0.4.0

## 0.3.1

### Patch Changes

- 791a215: Fixed Cluster selectors when only one cluster is configured.
- Updated dependencies [791a215]
  - @giantswarm/backstage-plugin-kubernetes-react@0.3.2

## 0.3.0

### Minor Changes

- 043fa87: Use filters layout for Flux overview UI.

### Patch Changes

- Updated dependencies [043fa87]
  - @giantswarm/backstage-plugin-kubernetes-react@0.3.0
  - @giantswarm/backstage-plugin-flux-react@0.3.0
  - @giantswarm/backstage-plugin-ui-react@0.3.0

## 0.2.3

### Patch Changes

- 8dc3086: Fixed Flux resource status transition.

## 0.2.2

### Patch Changes

- a8d459f: Made Flux overview tree items expanded by default.
- a8d459f: Fixed Flux resource highlighted state.
- a8d459f: Truncated Flux resource names in the overview tree.
- bade551: Handle Flux resource status when dependency is not ready.

## 0.2.1

### Patch Changes

- 835c08f: Fixed dark theme colors.

## 0.2.0

### Minor Changes

- 8685deb: Added Flux overview UI.

### Patch Changes

- Updated dependencies [8685deb]
  - @giantswarm/backstage-plugin-kubernetes-react@0.2.0
  - @giantswarm/backstage-plugin-ui-react@0.2.0
