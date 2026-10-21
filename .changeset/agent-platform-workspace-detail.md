---
'@giantswarm/backstage-plugin-agent-platform': minor
---

A workspace has its own page, at
`/customize/workspaces/<installation>/<organization>/<name>`, with three tabs:
**Repositories** (each linked to its provider, with its head commit and its
last push, marked "after last synchronization" when it moved since),
**Sessions** (each with its person, last turn and cleanup date) and
**Details** (the synchronization status with what started it, a failure in
the workspace-manager's words, and the storage). **Synchronize** shows the
synchronization running and notifies its outcome when it ends. Edit and
Delete sit beside it, and the editor of a workspace closes back to its page.
The Workspaces tab's names and a Session's workspace drawer link to it; a
person outside the workspace's Organization gets a "not a member" page.
