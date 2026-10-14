---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Agent Platform: a client for the workspace-manager's tools over muster, as the signed-in person, without UI yet. `lib/workspaceManager.ts` has the tool names as muster exposes them (`x_workspace-manager_<tool>`), the request and result types of workspace-manager 0.4.1 and `classifyWorkspaceManagerError` (not a member, invalid, not found, already exists, conflict, unavailable); `authorizationError` turns a refused or connect-required `authorize_workspace` answer into the error a Session start shows, with the unreadable repositories or the providers to connect and their links. `WorkspaceManagerClient` has one method per tool; `useWorkspaceManagerClient(installation)` builds it and `useWorkspaceManagerAvailability(installation)` says whether the installation's muster lists workspace-manager.
