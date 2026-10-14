---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': patch
---

Session states use one vocabulary everywhere: Waiting for you, Working, Finished and Failed. `describeSessionState` returns those words as `label`, and the separate `shellLabel` and `SHELL_STATE_LABELS` are gone (`SESSION_STATE_LABELS` replaces the latter). An agent's Sessions tab now uses the Sessions page's list, so a few sessions show without pagination, search or an Agent column.
