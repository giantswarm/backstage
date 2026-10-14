---
'@giantswarm/backstage-plugin-agent-platform': minor
'app': minor
---

Customize gains a **Workspaces** tab, between Skills and Connectors, on
installations whose muster lists the workspace-manager (absent elsewhere). It
lists the workspaces of one Organization: their sources, repository count,
what the shared volume stores (with the share's size where its class
provisions one), the last sync's result (when it happened and why it failed
behind its info icon), and the Sessions with a directory on it, searchable. A
person in several Organizations picks one with the Organization control beside
the Environment; a person in one never sees it. Each row offers Sync now and
Delete; Delete asks first, naming the workspace and the Sessions still using
it, which keep their directories until each is cleaned up. Open, Edit and
Create workspace come with the workspace page and editor. New exports:
`CustomizeWorkspacesPanel` and `WorkspaceOrganizationSelect`.
