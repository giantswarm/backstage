---
'@giantswarm/backstage-plugin-agent-platform': patch
---

An Agents list row names an organization's agent's organization as
"Organization: acme", beside the agent's name, so it is not read as the
environment among the facts, and a platform agent's row no longer shows a
"None" and an info icon without a label. Every row of the list has the same
fact columns, which stay on one line beside the name or under it on every row
alike, so organization and platform agents' rows line up. The agent's page and
the Organization filter keep "None". The row's facts sit on one baseline.
