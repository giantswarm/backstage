---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
---

`catalogFilterDimensions` draws a filter only where picking from it can narrow
the list: one value every entry shares (one repository, organization, model or
agent) gets no dropdown, a flag such as Favorites still does, and a filter with
a pick in force stays until it is cleared. A bar with no filters draws nothing.
