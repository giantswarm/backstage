---
'@giantswarm/backstage-plugin-agent-platform-backend': patch
'@giantswarm/backstage-plugin-gs-node': patch
---

The avatars route answers 404, an agent without an avatar, when the
installation serves no avatars (its avatars host has no address, or a route
that is not the renderer answers 406 because the renderer is off), instead of
502, and does not ask that installation again for a minute. The portal shows
the initials either way. A 502 stays for a renderer or gateway in trouble
(another 4xx, a 5xx, a timeout, something other than a raster image).
`gs-node` exports `isDnsErrorCode`.
