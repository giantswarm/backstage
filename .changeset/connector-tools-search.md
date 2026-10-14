---
'@giantswarm/backstage-plugin-muster': patch
---

A connector's Tools tab takes its search from the page's `?q=`, so a connector
the Customize › Connectors search matched by its tools opens on the matching
tools. A search there that finds nothing says what it could not look at: the
tools while they load, fail or need a muster session, and the connectors whose
tools wait on a sign-in or could not be read.
