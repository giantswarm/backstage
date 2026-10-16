---
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

The avatars route answers 404, an agent without an avatar, when the
installation serves no avatars (its avatars host has no address, or refuses
the path with a client error because the avatar renderer is off), instead of 502. The portal shows the initials either way; a 502 stays for a renderer that
is there and fails, and the handled case is logged at debug, not warn.
