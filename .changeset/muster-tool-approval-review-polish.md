---
'@giantswarm/backstage-plugin-muster': patch
---

Tool approval polish: where muster cannot read a connector's settings, the Test & Tools step and the Tools tab say what muster does (it reports every tool as Ask and does not run them until it can read the settings). Each setting pill is described by its line in the legend for screen readers. A blocked tool's row on the Tools tab no longer counts under _What it does_. A create asks muster once more whether it takes a preset after a transient failure instead of stopping. The unwired _Allowed for_ on the Tools tab is removed until agent-manager reports the grants.
