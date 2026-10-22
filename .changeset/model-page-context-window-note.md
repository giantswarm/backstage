---
'@giantswarm/backstage-plugin-agent-platform': minor
---

A model's page says on Overview when no context window is configured for the
model, or when the one configured is not a number of tokens: an info note
under the facts says that a window lets a session show how full its context
is, and whom to ask to set it in `agentPlatform.models.contextWindows`, with a
link to its documentation. A model the table names keeps its Context window
fact. The page's Created fact reads as a relative time ("3 days ago"), the
full date on hover, like the shell's other relative dates.
