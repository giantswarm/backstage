---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

Every tool of a connector opens on a page of its own under the connector
(`/agent-platform/connectors/<connector>/tools/<tool>`): what it does,
description, input schema, the form that runs it and the result, in one
column. The connector's Tools tab lists its tools as links to these pages
instead of running them in place. Going back from a tool, by the breadcrumb or
the browser's Back, keeps the tab's search and filter; Back also keeps how far
the list was paged.

A tool's markers read as the Tools list words them everywhere, "Reads" or
"Changes things", never "read-only" or "destructive"; the agent wizard's tool
catalogue drops its extra "destructive" marker beside the "Changes things"
badge.
