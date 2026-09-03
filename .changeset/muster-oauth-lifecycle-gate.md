---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-muster-backend': patch
---

MCP servers page: disable Start/Restart (with an explanation pointing at the
sign-in flow) for an OAuth server waiting on a per-user sign-in, where muster
refuses them by design; surface muster tool errors as their human-readable
text instead of the serialized `{"isError":...}` JSON envelope.
