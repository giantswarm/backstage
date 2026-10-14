---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

Detail pages in the agent-platform shell no longer flash a different page layout while they load. The agent, model, skill, session, connector and workflow pages render their final header (breadcrumbs, avatar or tile, title line, badge row, tabs, facts column) from the first paint, with skeletons where the data is still being read. An agent, model or session already in the query cache renders at once, instead of showing the loading state while the persisted cache is restored. Opening a detail page no longer shows the section's list header ("Agents", "Sessions", "Models") while the page's code loads, and the Agents and Sessions tabs wait for the agent-platform cookie only once per page load instead of on every visit. `ShellPage` gains `ShellPageTitleSkeleton`, `ShellPageBadgeSkeleton` and `ShellPageFactsSkeleton` for these loading states.
