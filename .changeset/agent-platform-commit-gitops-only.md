---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Offer a pull request (agent-manager's commit mode) only for deleting an agent
applied from git, the only kind that has a GitOps repository to open one in.

The delete dialog and the Edit agent page no longer show Commit for an agent
written live. An agent applied from git, which agent-manager refuses to delete
live, can now be deleted through a pull request when agent-manager reports the
commit capability: the actions menu offers Delete for it, and the dialog's only
action is "Open pull request". Edit and Update skills stay unavailable for such
agents.
