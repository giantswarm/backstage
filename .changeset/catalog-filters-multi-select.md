---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': patch
---

Customize filters become one multi-select dropdown per field (T64).

`CatalogFilterBar` draws each facet as a bui `Select` in multiple-selection
mode instead of a row of chips: the trigger names the field ("Source All",
"Source acme/skills", "Source 2 acme/skills and gs/skills"), the list shows each
value with what it keeps under the search and the other picks ("acme/skills
31"), and a facet with more than `SEARCH_MIN` values gets a search inside its
list. Picks within one dropdown widen the list (any of them); dropdowns narrow
each other. Every facet the catalog has a value on is drawn — a field with a
single value is a dropdown of one option, so the Skills tab's Source filter no
longer disappears on a one-repository installation. The row wraps at phone
width, two dropdowns to a row.

API changes in `@giantswarm/backstage-plugin-ui-react`:

- `CatalogFilterSelection` holds a list of picked values per facet;
  `useCatalogFilters().select(facetId, values)` takes that list (empty picks
  the whole facet again).
- `CatalogFilterDimension` has `selected: string[]` in place of `value` and
  `total`.
- `CatalogFilterBar` takes an optional `onClear`, offering "Clear filters"
  while anything is picked.
- `ALL_FILTER_VALUES`, `FILTER_CHIPS_MAX` and `FILTER_CHIPS_CLASS_NAME` are
  removed.

The agent wizard's skill step (via `SkillsFilterBar`) and its tool step's
"What it does" filter use the same dropdowns; on the tool step, picking both
kinds is the same as picking none.
