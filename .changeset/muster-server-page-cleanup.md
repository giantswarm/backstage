---
'@giantswarm/backstage-plugin-muster': patch
---

A server page's tabs read Tools, Instances (for a server family), Resources, Prompts and Details. Resources and Prompts show only when the server exposes any, and the Overview tab is renamed Details (`…/details`; an `…/overview` link still opens it). The Tools tab is a table with the columns Tool, Annotations (read-only / destructive, only when a tool has one) and Description, sortable by each and paged (25 a page, as the Sessions table). In the Instances table, an instance's name is a plain link and its status plain text, as in the servers table.

A workflow opened from the Workflows table opens scrolled to the top, not at the list's scroll position.

On a tool page, the read-only / destructive markers sit at the end of the "Exposed by muster as" line instead of on a line of their own.
