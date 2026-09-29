---
'@giantswarm/backstage-plugin-ui-react': minor
---

Export `MENU_WIDTH`, the definite width to give a bui `Menu`: without one the
menu popover lays out twice and the browser reports "ResizeObserver loop
completed with undelivered notifications", which trips the dev-server overlay.
