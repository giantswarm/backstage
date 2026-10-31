---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
---

One rule for search across the agent platform: a list of entities shows its
search and filters from three entries on (`isSearchableList`, `SEARCH_MIN` now
3, was more than 8), and keeps them while a search or filter is in force; a
dropdown offers type-ahead from three options (`searchableIf`). Paging is
unchanged.
