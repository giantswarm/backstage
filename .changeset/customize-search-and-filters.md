---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
---

The shell's Customize tabs (Agents, Skills, Connectors, Models, Workflows)
always show their search, however short the list, and gain filters under it in
the sessions list's chip idiom. Each filter shows only when it would change the
list — skills from one repository get no Source chips — and each chip counts
what picking it would leave, over the search and the other picks.

- **Agents**: Model, and Favorites once something is starred. The environment
  stays the page's Environment select (shown with more than one installation).
- **Skills**: Source repository, and Usage (used by an agent or not) once the
  agents are read.
- **Connectors**: Sign-in (how a person signs in) and Connection (connected,
  partly connected, sign-in needed, not connected, deactivated).
- **Models**: Provider.
- **Workflows**: Last run (failed, running, succeeded, not run yet). One read
  of the installation's newest 500 runs answers it for every workflow; a
  workflow outside that window reads "No recent run" rather than "Not run yet".

A list emptied by a filter says so and offers _Clear filters_; a new filter
starts the windowed list again from its first page.

ui-react adds `CatalogFilterBar`, `CatalogNoMatch` and `useCatalogFilters`
(faceted single-choice filters: chips up to six values, a select beyond).
Inside agent-platform, the skill catalog's Source and Usage filters are their
own `SkillsFilterBar` and `useSkillFilters`, for the agent wizard's skill step
to reuse.
