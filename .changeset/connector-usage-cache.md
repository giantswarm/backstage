---
'@giantswarm/backstage-plugin-muster-backend': minor
'@giantswarm/backstage-plugin-muster': minor
'app': patch
---

Usage › Connectors loads faster. The muster backend reuses a usage answer for five minutes per installation, window, connectors and person, shares one read between identical requests, and serves each tool's p95 latency from the new `GET /usage/tool-latency`, so the figures no longer wait for the slowest query. The muster plugin's `MusterApi` gains `getMcpToolLatency`, the tool tables fill in their p95 column when it arrives, and the usage reads and the shell's tag lists are reused for five minutes instead of being read on every mount. The settings storage reuses a "not set" answer for a minute while the signals channel is connected.
