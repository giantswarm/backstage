---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

In fixture mode, muster answers the New connector flow's transport probe (`core_mcpserver_detect`) and definition check (`core_mcpserver_validate`), and its tool catalogue describes them and the connector writes `core_mcpserver_create` and `core_mcpserver_update`. A unit test in each plugin finds every tool call with the TypeScript compiler and fails when a tool the pages call has no fixture handler and is not listed as not served; `@giantswarm/backstage-plugin-muster/testUtils`, a subpath for tests, exports the check.
