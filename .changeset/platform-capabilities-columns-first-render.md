---
'@giantswarm/backstage-plugin-platform-capabilities': patch
---

The Installations page's capability columns are there on the table's
first render and the rows keep their height. The plugin knows the
platform's capabilities by name (`agent-platform`, `customer-portal`) and
renders their columns before anything has been asked of the manager; the
manager's definitions and then the listing confirm the set, in name order
whatever the source, so no column appears late or moves. Each cell's
skeleton is laid out in the icon's own box, so a row is as tall before the
icons arrive as after. Before, the columns waited for `get_info` (a second
or two through the backend and muster) and the table laid out three times:
its base columns, then the capability columns, then taller rows with the
icons. The dev harness has a latency for `get_info` too.
