---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Agent Platform: the resolved toolset list no longer renders every tool at once.
A preset like `read-only` can resolve to hundreds of tools across a dozen
servers, which made the Tools step, the review step and an agent's Toolset card
into pages of endless scroll. The list now opens as its counts — every group,
server and workflow prefix collapsed behind a one-line inventory, the same
disclosure structure the Tools step's catalogue already uses — with a search
field that opens the sections its matches are in. A resolution short enough to
read at a glance still shows itself outright.

Long row lists everywhere in the step now reveal a page at a time (with _Show
fewer_ to go back) instead of a single _Show all_ that swapped a long list for a
longer one.
