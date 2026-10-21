---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

Every connector, tool and workflow link names its installation. The search
palette lists a connector once per installation it is registered on, with the
installation beside it, and opens the connector there. A connector's Edit opens
the wizard with `&installation=<inst>`, and the wizard edits the server on that
installation before falling back to the active one.
