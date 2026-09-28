---
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

The session timeline and session usage count the tokens a failed or canceled turn reports on its status message, where the claude Harness puts what a failed Claude Code turn spent. The message stays off history, so the failed-turn entry still shows the reason. Session usage also counts the usage on a pending prompt of a turn awaiting input, as the timeline does, and no longer credits a message from a turn outside the window to a later turn that repeats it. A failed turn's reason no longer renders a second time when a later turn's history repeats it. `readTurnStatus`, `historyWithPendingPrompt` and `claimEndedTurnUsage` are exported.
