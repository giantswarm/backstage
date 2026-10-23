---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The edit page and the Delete dialog of an agent applied from Git check up
front whether agent-manager can open a pull request for it. An agent defined
outside agent-manager's directory gets an explanation instead of the form (or
only Close in the dialog), linking the repository and the path to change it
in; a missing GitHub authorization gets the agent-manager sign-in before the
person starts. Any other failure of the check leaves the form and confirm as
they were. The review step shows the same two refusals the same way.
