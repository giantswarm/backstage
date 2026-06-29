---
'@giantswarm/backstage-plugin-muster': patch
---

Polish a few copy and edge-state details in the muster manager.

- Core tool-family titles render verbatim again: the `text-transform: capitalize` on the muster-core families panel was turning the curated label "MCP server definitions" into "MCP Server Definitions"; it is dropped, and an explicit "Events" label is added so the un-curated `events` family no longer renders as a bare lowercase segment.
- The workflows list distinguishes a zero-data installation ("No workflows in this installation.") from a filtered-to-empty result ("No workflows match your filters.") instead of always implying a filter is hiding rows.
- A stale `/workflows/<name>/run` deep link (the bespoke Run route removed when Run was unified with the tool explorer) now redirects to the workflow detail page, preserving the query string, rather than silently resolving to the full workflows list.
