---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-common': minor
---

A workspace setup notice from kagent's harness shows as a status of its turn,
not as the agent's reply: an alert above the agent's answer with one summary
line ("Workspace setup: 3 repositories not updated"), a warning when the setup
failed, the directory was set up again or repositories stayed at the last sync,
and information when they are up to date again, with git's reasons folded
under Technical details. It renders the same live and after a reload, and no
longer counts as a reply. kagent does not mark a notice, so it is recognised by
its text on the message that opens the turn; `readKagentNotice` also reads a
proposed mark (`kagent.dev/notice`) that kagent does not send yet.
