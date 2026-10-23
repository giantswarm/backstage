---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
---

The edit page and the Delete dialog of an agent applied from Git check up
front whether agent-manager can open a pull request for it. An agent defined
outside agent-manager's directory gets an explanation instead of the form (or
only Close in the dialog) that says why in plain words and links the
repository to change it in, with what agent-manager checked under Technical
details; a missing GitHub authorization that a sign-in to agent-manager
gives gets that sign-in before the person starts. Any other answer leaves the
form and confirm as they were. The review step, Update skills and Change
Harness explain the same refusal the same way, worded per action, and keep
the release and the file agent-manager looked for under Technical details.

The muster plugin exports `useServerNeedsSignIn`, whether muster reports a
server as waiting for the person's sign-in.
