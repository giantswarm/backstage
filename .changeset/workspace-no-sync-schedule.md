---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Drop the workspace sync schedule from the workspace-manager types, which
workspace-manager no longer has: `sync` and `nextSync` are gone from
workspaces and their create and update inputs, and so is the `schedule` sync
trigger.
