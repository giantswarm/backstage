---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The skill page is a single column, as the connector page is: its facts
(source, path, branch, latest commit) move into the Overview under "Where it
lives". The header's View source button is gone; the latest commit links to the
skill's folder at that commit instead. The Used by tab lists the agents as the
connector page's does, with the same rows (each agent's name a link to its
page, where it runs at the row's end, and its namespace where two agents share
a name on one installation), empty state and Show all N agents. On a phone,
both pages write that detail under the agent's name.
