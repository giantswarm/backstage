---
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

The avatar proxy answers an installation whose avatars host it cannot connect
to (no route to the address, a refused connection, no connection within 3 s)
as an installation without avatars: a 404 the browser and the backend keep for
five minutes, logged once at info, so the agent's initials show at once. Before,
each avatar waited up to 10 s and logged a warning. A reachable avatar service
that answers slowly, with an error or with something other than an image still
logs a warning.
