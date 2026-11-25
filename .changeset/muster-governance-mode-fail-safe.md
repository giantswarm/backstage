---
'@giantswarm/backstage-plugin-muster': patch
---

The connector wizard no longer assumes a trusted platform when it cannot read the governance mode: a new connector is created with the _Recommended_ preset and the Test & Tools step pre-selects _Recommended_ with a note that the mode could not be read. _Allow all_ is pre-selected and sent only where muster reports the platform trusted. muster reports no mode to the portal yet; `governanceModeOf` is the one place its source plugs in.
