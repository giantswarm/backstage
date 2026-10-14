---
'@giantswarm/backstage-plugin-ui-react': minor
---

`RouteTabs` (and so every `ShellPage` tab strip) scrolls sideways at phone
width instead of wrapping or squeezing: one row of 44px-tall tabs, the
selected tab scrolled to the middle of the strip on mount and on every tab
change, a fade at each edge that has more tabs beyond it, and the active
underline in the right place under any scroll. `ShellPage` lets the strip
reach through the page gutter to the screen's edges. New `className` prop on
`RouteTabs` for the strip. Desktop is unchanged.
