---
'@giantswarm/backstage-plugin-muster': patch
---

The connector's Test & Tools step and Tools tab tell two tool approval states apart: muster could not read the connector's settings (`approval.source: unavailable`), and approvals cannot be answered right now because a prerequisite is missing (`approval.unavailable`, muster's reason). The second shows as a warning with the reason, above the settings, which stay as they are.
