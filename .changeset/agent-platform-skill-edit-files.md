---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Editing a skill that has more files than its SKILL.md lists them under the Instructions field: "These N files stay as they are", each linking to the skill page's file viewer in a new tab, plus "Edit on GitHub ↗". A link in the instructions to a file the skill does not have gets a quiet warning. The hand-off to the skill creator agent now also carries the instructions typed so far (on an edit, the ones rewritten) in its first message.
