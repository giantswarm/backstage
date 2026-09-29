---
'@giantswarm/backstage-plugin-muster': patch
---

Add `installationErrorLine`, the line a page prints for an installation whose
read failed: the backend's plain words as they are, the muster sign-in prompt
for a 401, never the MCP SDK's transport text.
