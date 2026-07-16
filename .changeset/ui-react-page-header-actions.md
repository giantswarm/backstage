---
'@giantswarm/backstage-plugin-ui-react': minor
---

Add a `PageHeaderActions` slot so routed page content can contribute action
buttons to the surrounding page header instead of rendering a second header of
its own: `PageHeaderActionsProvider`, `usePageHeaderActionsSlot` (for the page
layout to read), and `useProvidePageHeaderActions` (for content to register
actions, cleared automatically on unmount).
