---
'@giantswarm/backstage-plugin-muster': minor
---

The connector wizard asks for the operating region of an AWS SigV4 connector and requires it, since muster refuses a SigV4 server without `requestMeta.AWS_REGION`; it was an advisory before, pointing to a Details field that did not exist. Request metadata is sent as `requestMeta` to a muster whose create and update tools take it, and under its former name `meta` otherwise, so the wizard works against muster releases on either side of the rename. Request metadata names are checked against muster's rules (the MCP `_meta` key format, MCP-reserved prefixes, `progressToken`, `traceparent`, `tracestate` and `baggage`) before saving. The server page labels the rows "Request meta", and reads `spec.requestMeta` or, for a server stored before the rename, `spec.meta`.
