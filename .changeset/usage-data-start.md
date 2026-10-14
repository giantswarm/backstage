---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-agent-platform-backend': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-muster-backend': minor
---

Usage: when the selected time range reaches back further than an
installation's metrics, Overview, Cost and Connectors say where the data starts
and how many of the range's days it covers. The Cost tab shows the change
against the previous range only when the data covers that whole range. The
muster-backend `/usage` route returns `data_start`, and the common package
exports `usageDataStart` and `formatUsageDay`. The session usage reader's
`maxAgeMs` now defaults to `windowDays` plus one day, so raising `windowDays`
no longer drops sessions idle for longer than 31 days.
