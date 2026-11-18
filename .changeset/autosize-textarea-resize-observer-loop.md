---
'@giantswarm/backstage-plugin-ui-react': patch
---

`useAutosizeTextarea` sets the height for a new width in the next animation frame instead of in its `ResizeObserver` callback, and ignores observations whose width did not change, so resizing a field no longer reports "ResizeObserver loop completed with undelivered notifications".
