---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The Workspaces tab follows a workspace's synchronization without a reload.
A workspace just created or changed, or one synchronized from its row, says
"Synchronizing" until the workspace-manager reports the result, then
"Synchronized", "Unchanged" or "Failed" with the manager's reason. While a
synchronization runs, the list reads again every 5 seconds for the first two
minutes and every 15 seconds after that, but not while the browser tab is
hidden. A synchronization the manager has not reported yet is expected for
30 minutes at most. The list, the workspace's page and its Synchronize
button use the same state. A requested synchronization reads
"Synchronizing" everywhere, and Synchronize waits while the manager reports
one running or requested.
