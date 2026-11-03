---
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

Name time windows in words instead of PromQL durations: the session cost
popover, the by-agent cost note and the connector usage empty state now say
"the last 7 days" rather than "the last 7d". The new `lastDaysNoun` helper in
`agent-platform-common` turns a days window into words (`the last day` for
one), and `useTokenRates` reports its window as `windowDays` instead of the
PromQL string.
