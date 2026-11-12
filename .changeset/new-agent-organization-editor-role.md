---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The New agent form's Organization picker shows an organization where the person may use but not create agents disabled, with the reason that the editor role is necessary, and says so when that is true of all their organizations. It follows agent-manager's `createAgents` permission; with an agent-manager that does not send it, every organization stays selectable.
