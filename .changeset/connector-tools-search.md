---
'@giantswarm/backstage-plugin-muster': minor
---

A connector's Tools tab opens with its search seeded from the page's `?q=`, so a
connector the Customize › Connectors search matched by its tools opens on the
matching tools. A search there that finds nothing says what it could not look
at: the tools while they load, are cut off or need a muster session, and the
connectors whose tools wait on a sign-in, could not be read or were not listed.
