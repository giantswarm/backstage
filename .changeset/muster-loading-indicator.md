---
'@giantswarm/backstage-plugin-muster': patch
---

The muster views wait for the fleet's inventory probes before concluding that no installation runs muster, so the Servers, Dashboard, Workflows and Tool explorer views no longer flash "No muster installation" on the way to their content. All four now show a `LoadingIndicator` while they load.
