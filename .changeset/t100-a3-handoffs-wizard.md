---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': patch
---

Meta-agent hand-offs that start a session are named "Create with", "Edit with" or "Evaluate with" the agent, and their strips say a session starts. The skill hand-off also carries a rewritten description of a skill being edited. A hand-off's first message is captioned "Prepared by the portal" in the session it opens. The agent wizard asks before Close or Cancel discards entered input, through the new `confirmDiscard` prop of `WizardFrame`.
