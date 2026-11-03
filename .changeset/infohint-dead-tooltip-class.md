---
'@giantswarm/backstage-plugin-ui-react': patch
---

`InfoHint` and `DisabledAction` no longer pass a class to their bui `Tooltip`,
which drops it: the classes' 280px width (and `InfoHint`'s kept line breaks)
never applied. Nothing changes on screen; the tooltips keep bui's own width.
