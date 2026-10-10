---
'@giantswarm/backstage-plugin-agent-platform': minor
---

A model's page is a read view now, with **Edit** as an action that turns it into the form in place: what the model cost and how much it was used over the last 30 days (the gateway's figures, snapshots of the model included), its cost per day, the agents that run on it with what each spent on it, and the facts beside it — model ID, endpoint, context window where `agentPlatform.models.contextWindows` names it, environment, created. Model hosting in the agent shell gets a headline row (models running, GPUs in use, GPU pools, GPU cost now, model cache) and the prototype's tab names (Running models · GPU pools · Model cache, the cache a tab of its own). GPU node pools show what their running nodes cost per hour at cluster-manager's on-demand list price for their node sizes.
