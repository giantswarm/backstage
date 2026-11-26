---
'@giantswarm/backstage-plugin-muster': patch
---

The tool settings can be filtered by approval setting (Allow, Ask, Block), beside the search and "What it does", for example to list every blocked tool. A row whose setting is changed while a filter is active stays listed, marked as no longer matching, until the search or filter changes. The connector's Tools tab builds its Approval filter from the same shared definition.
