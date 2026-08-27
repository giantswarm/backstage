---
'@giantswarm/backstage-plugin-muster-backend': minor
'@giantswarm/backstage-plugin-muster': minor
---

Show the resources and prompts an MCP server contributes, alongside its tools.

The server detail panel previously listed only tools, so the `pro` server's
`roadmap://schema` and `customer://schema` — whose descriptions tell an agent
which field names and filter values are valid before it makes a call — were
invisible in the portal.

Resources cannot be scoped the way tools are. A tool name carries an
`x_<server>_` prefix that `filter_tools` matches on, but a resource URI
carrying a scheme is exposed by the aggregator unprefixed, so the URI says
nothing about which server produced it and two servers can expose the same one.
The new panels scope by source server instead, via muster's `filter_resources`
and `filter_prompts` (muster#1096, muster v5.6.0).

The Resources and Prompts sections render only when the server actually
contributes some, read from the new `resourcesCount` / `promptsCount` on
`core_mcpserver_list` — most servers expose neither, and a permanently empty
section reads as broken rather than as informative. When a section is shown but
comes back empty, it says the server may be down or require authentication
rather than asserting that none exist: a session that has not signed in to an
OAuth-gated server sees an empty catalogue for it.
