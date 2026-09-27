---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Serve dialog: the chosen preset (and the installation) stays while the Serving page refreshes. Every poll of the served list passed a new list of targets, which re-seeded the dialog and reset the preset to the first one within seconds, before a slow fit check could finish; the dialog now re-seeds only when it opens, gets a new seed, or the set of targets changes.
