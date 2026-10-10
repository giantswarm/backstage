---
'@giantswarm/backstage-plugin-gs': patch
---

An installation pin remembered from an earlier visit (`muster-installation` in
localStorage) that names an installation the portal does not know is now
forgotten once the installations config has loaded, and the Agent Platform
section shows all installations. On a single-installation portal, which has no
selector, any unknown pin (a deep link included) falls back to the one
installation. Before, the pages went blank with nothing to click.
