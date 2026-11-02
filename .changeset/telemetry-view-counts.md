---
'@giantswarm/backstage-plugin-analytics-react': minor
'@giantswarm/backstage-plugin-agent-platform': minor
'app': minor
---

Usage data says how big what people work with is, in coarse buckets (`0`,
`1`, `2-4`, … `100+`) and never by name. Opening an agent's page sends
`AgentPlatform.agentViewed` with its number of skills and of tools; opening a
session sends `AgentPlatform.sessionViewed` with its number of turns; opening
Customize sends `AgentPlatform.customizeViewed` with its number of agents,
skills, connectors, models, workflows, workspaces and toolchains. Each goes
once per opening of the page, once its counts are read.
`AgentPlatform.messageSent` now carries the session's number of turns.

`analytics-react` adds `useTrackedView`, which reports a page's view event
once per opening, and `countBucket` and `countBucketOrUnknown`, which put a
count in its bucket.
