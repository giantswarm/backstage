---
'@giantswarm/backstage-plugin-ui-react': minor
---

Remove `LastDaysSelect`, together with `LastDaysSelectProps` and
`LAST_DAYS_SELECT_CLASS_NAME`. Nothing imports it since the Usage screen's time
range became `UsageWindowSelect` in `agent-platform`, whose options include
calendar months as well as day counts. Code that still imports it can use a bui
`Select` with its own options.
