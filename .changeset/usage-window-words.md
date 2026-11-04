---
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

Name time windows in words instead of PromQL durations: the session cost
popover, the by-agent cost note and the connector usage empty state now say
"the last 7 days" rather than "the last 7d". A one-day window, which kagent's
configurable session window allows, reads "the last day" rather than "the last
1 days". The new `lastDaysNoun` (`the last 7 days`) and `lastDaysLabel`
(`last 7 days`) helpers in `agent-platform-common` are where every days window
in the copy turns into words, and `useTokenRates` reports its window as
`windowDays` instead of the PromQL string.
