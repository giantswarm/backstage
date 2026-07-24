---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-gs': patch
---

Consolidate the duplicate `ContentRow` components onto the shared `ui-react`
library.

- `ui-react`: `ContentRow` now renders bui (`@backstage/ui` `Flex`/`Text`)
  instead of MUI v4, and adopts the proven stacked layout (bold title above its
  value). This fixes the previous inline variant, whose title and value touched
  because it had no gap/separator.
- `gs`: the `components/UI/ContentRow` duplicate is removed; the `UI` barrel and
  its consumers now re-export/import `ContentRow` from
  `@giantswarm/backstage-plugin-ui-react`.
