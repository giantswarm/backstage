---
'@giantswarm/backstage-plugin-ui-react': minor
---

- `ShowMore` shows a remainder too small to be worth a click with the page
  before it, in both modes: up to a fifth of a page, never fewer than two
  (`showMoreSlack(pageSize)`: 4 at the default 20, 2 at `USED_BY_ROWS`). A
  list of 21 at a page of 20 renders all 21 with no button. A page that
  reaches such a remainder includes it, and its button says so ("Show 24 more
  agents").
- `ShellPage` publishes its bottom padding as the CSS variable
  `--shell-page-padding-bottom` (exported as `SHELL_PAGE_PADDING_BOTTOM_VAR`),
  so content docked with `position: sticky` can rest where it sticks.
