---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
---

`catalogFilterDimensions` draws a filter only where picking from it can narrow
the list: it needs two values among the entries that have one, so one
repository, organization, model, agent or Harness gets no dropdown, even while
some entries have no value yet. A facet with `missingIsChoice` (a flag: Pinned,
Starred, "Created by: Me") is drawn from one value some entries lack. A filter
with a pick in force stays until it is cleared. A bar with no filters draws
nothing.
