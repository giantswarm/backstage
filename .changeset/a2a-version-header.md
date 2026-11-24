---
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

Send `A2A-Version: 1.0` on every A2A call to kagent. A controller on a2a-go 2.7.0 or newer treats a call without it as protocol 0.3 and refuses it with `VersionNotSupported`; older controllers ignore the header.
