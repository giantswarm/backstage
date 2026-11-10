---
'@giantswarm/backstage-plugin-muster-backend': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'app': patch
---

Usage › Connectors loads faster. The muster backend reuses a complete usage answer for five minutes per installation, window, connectors and signed-in user, across page reloads, shares one read between identical requests, and serves each tool's p95 latency from the new `GET /usage/tool-latency`, so the figures no longer wait for the slowest query. The muster plugin's `MusterApi` gains `getMcpToolLatency`, the tool tables fill in their p95 column when it arrives, and the usage reads and the shell's tag lists are reused for five minutes, and the serving layer's node list for a minute, instead of being read on every mount. The usage read finds the prometheus server once per person, and reads the week before the window apart. The settings storage shares one read between components that subscribe to a key together, and reuses a "not set" answer for a minute while the key's change announcements are being received.
