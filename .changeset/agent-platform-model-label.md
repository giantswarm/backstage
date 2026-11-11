---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The create-agent wizard ("Runs on …"), the model picker's cards and the agent page name a model the way the agents list does: its display name when an admin set one, else the model it runs (for example `claude-sonnet-4-6`), and its resource name only when neither is set. A model config without a display name no longer shows as its resource name, such as "anthropic".
