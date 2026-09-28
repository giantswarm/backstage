---
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

The session timeline and session usage count the tokens a failed or canceled turn reports on its status message, where the claude Harness puts what a failed Claude Code turn spent. The message stays off history, so the failed-turn entry still shows the reason. `readEndedTurnUsage` is exported.
