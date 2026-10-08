---
'@giantswarm/backstage-plugin-agent-platform-common': patch
---

An attachment past the preview size cap is refused before its payload is read
as base64: the characters that carry bytes are counted up to the cap and no
further, and the payload is normalised with plain loops rather than a regular
expression, whose backtracking over a payload of ~11 MB could exhaust the
engine's stack (`RangeError: Maximum call stack size exceeded`) and make the
chat fail to render a message instead of showing the attachment as too large.
