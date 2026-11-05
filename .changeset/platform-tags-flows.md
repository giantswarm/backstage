---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

Handing a skill to the skill creator agent carries its tags (a new skill's, or an edit's changed ones) into the first message. "Edit in Git" for a GitOps-managed connector or workflow names the tags annotation.
