---
'@giantswarm/backstage-plugin-agent-platform': patch
---

On a session page, a tool call's result shows as soon as it streams in, and a
reply is never shown cut off where a background read happened to catch it. The
stored copy of an item now takes over whatever the live preview already knows.
