---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The Workspaces tab follows a workspace's synchronization without a reload:
a workspace just created or changed, or one synchronized from its row, says
"Synchronizing" until the workspace-manager reports the result, then
"Synchronized", "Unchanged" or "Failed" with the manager's reason. The list
reads again every 5 seconds for the first two minutes of a synchronization and
every 15 seconds after that. It stops after 30 minutes, once nothing syncs,
and while the browser tab is hidden. The list, the workspace's page and its
Synchronize button all use the same state, so they always say the same
thing: a requested synchronization reads "Synchronizing" everywhere, and the
row's Synchronize… is disabled while one is under way, as the page's button
is.
