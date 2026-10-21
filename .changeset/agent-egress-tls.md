---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The agent form's Extra egress origins take `tls://<host>:<port>` beside
HTTP(S) origins: a service that speaks TLS, such as a database, by host and
required port. An entry without a port is refused with the reason, as is a
host and port listed over two protocols, in agent-manager's words. The
Configuration card lists both forms.
