---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Drop the workspace sync schedule from the workspace-manager types, which
workspace-manager no longer has: `sync` and `nextSync` are gone from
workspaces and their create and update inputs. The `schedule` sync trigger
stays as a legacy value, since a last sync recorded before the upgrade may
still carry it.
