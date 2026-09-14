---
'@giantswarm/backstage-plugin-agent-platform-common': minor
---

`readTurnProgress(tasks, now)` classifies a session's newest turn as `working`,
or `stalled` since the task's last timestamp once it has not advanced for
`ACTIVE_MAX_AGE_MS`; a terminal task, one waiting on a human, or a session that
never ran is neither. `isAgentWorking` is now defined on top of it, so the two
cannot disagree about when a turn stops counting as live.
