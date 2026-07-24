---
'@giantswarm/backstage-plugin-ui-react': patch
---

Migrate `AsyncValue` from MUI v4 to bui (`@backstage/ui`). The loading state now
renders a bui `Skeleton` instead of a MUI `Box` wrapping a
`@backstage/core-components` `Progress` bar. The public props are unchanged; the
`height` prop now sets the skeleton's height (default `24`).
