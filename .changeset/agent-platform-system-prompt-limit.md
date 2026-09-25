---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The system prompt field on the create and edit pages counts characters against
the 20,000-character limit agent-manager and the agent chart enforce, and points
to skills for long reference material. Past the limit the field is marked
invalid and says by how much; the create wizard stays on Details and the edit
page keeps Save locked. Characters are counted as agent-manager counts them
(code points), so an emoji counts once.
