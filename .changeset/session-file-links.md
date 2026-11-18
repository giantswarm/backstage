---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': patch
---

Show session filesystem links as local paths instead of navigating to nonexistent portal pages. Use Agent Platform wording for request failures and clear an unconfirmed-answer error when a later session read confirms the answer.

Measure turn progress from recorded messages and tool outputs as well as state updates. Place network refusals on the matching turn and explain that a blocked connection alone does not establish task failure. Keep unconfirmed answers recoverable and avoid inferred causes in runtime notices.
