---
'@giantswarm/backstage-plugin-agent-platform-common': patch
---

An attachment's base64 payload is normalised in one pass over its characters
rather than with a regular expression, whose backtracking over a payload of
~11 MB could exhaust the engine's stack (`RangeError: Maximum call stack size
exceeded`) and make the chat fail to render a message instead of showing the
attachment as too large.
