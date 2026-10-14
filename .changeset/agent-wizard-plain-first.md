---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The new-agent wizard reads plain-first. Step 1 is "Describe your agent": name, "What is it for?", instructions, the environment and the model (a sole model is now picked automatically); the runtime, the technical name and extra egress origins move behind a "More options" disclosure that sums up its defaults and opens by itself when one of its fields blocks Continue. The review step is "Check and create": a plain summary (name, purpose, model, runtime, skills, tools) comes first, the release, the toolset resolution and agent-manager's manifests sit collapsed under "Technical details", and the actions are "Create agent" and, where agent-manager offers it, "Propose as pull request instead". The Swarm Operator assist's accept button reads "Use these instructions".

Add model asks for the display name first and fills the technical name from it, and its intro now says what the page is for, pointing at Model hosting where a serving layer exists.
