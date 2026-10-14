---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-agent-platform-backend': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-muster-backend': minor
---

Usage: when the selected time range reaches back further than an
installation's records, Overview, Cost and Connectors say since when calls were
recorded and how many of the range's days that covers. The Cost tab shows the
change against the previous range only when the records reach back before it.
The muster-backend `/usage` route returns `data_start`, and the common package
exports `usageDataStart` and the Usage screen's day formatters
(`formatDayTick`, `formatDayTooltip`, `formatDayWithYear`). The session usage
reader's `maxAgeMs` now defaults to `windowDays` plus one day, so raising
`windowDays` no longer drops sessions by age alone; `maxSessions` still caps how
many are read, so raise it with a wider window.
