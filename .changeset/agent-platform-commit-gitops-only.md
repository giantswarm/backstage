---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Offer a pull request (agent-manager's commit mode) only for agents applied from
git, the only agents that have a GitOps repository to open one in.

The delete dialog and the Edit agent page no longer show Commit for an agent
written live. An agent applied from git, which agent-manager refuses to write
live, can now be edited and deleted through a pull request when agent-manager
reports the commit capability: the actions menu offers Edit and Delete for it,
the delete dialog's only action is "Open pull request", and the edit page
offers Commit instead of Save. Update skills stays unavailable for such agents.
