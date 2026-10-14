---
'@giantswarm/backstage-plugin-muster': minor
---

Every tool of a connector opens on a page of its own under the connector
(`/agent-platform/connectors/<connector>/tools/<tool>`): its markers,
description, input schema, the form that runs it and the result, across the
page's full width. The connector's Tools tab lists its tools as links to these
pages instead of running them in place, and the way back from a tool keeps the
tab's search.
