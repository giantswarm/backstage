---
'@giantswarm/backstage-plugin-flux-react': minor
'@giantswarm/backstage-plugin-flux': minor
'@giantswarm/backstage-plugin-gs': minor
---

Migrate the Clusters, Deployments, Installations, Catalog, and Flux pages to the new frontend system page header (rendered automatically from the page blueprint's title and icon), replacing the classic `Header`/`PageWithHeader` from `@backstage/core-components`.

- The Flux page's "List view" and "Tree view" are now sub-pages, rendered as tabs in the page header. `/flux` redirects to `/flux/list`; the tree view remains at `/flux/tree`.
- BREAKING (`@giantswarm/backstage-plugin-flux-react`): the `FluxPageLayout` component has been removed. `FluxListFilterBlueprint` and `FluxTreeFilterBlueprint` extensions now attach to `sub-page:flux/list` and `sub-page:flux/tree` (input `filters`) instead of `page:flux`.
- The page subtitles on the Clusters and Deployments pages have been dropped, as the new header does not support subtitles.
- The catalog page title no longer includes the organization name (`organization.name` config); it is now just "Catalog". Installations can override it via app-config: `app.extensions` → `page:catalog` → `config.title`.
- The `SupportButton` on the Catalog and Installations pages has been removed, as the new header has no place for it.
