---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The agent wizards keep the model's name (a platform admin may name a model on
purpose rather than after what it runs) and show the model it runs one step
away: an info button beside "Runs on …" on the first step, and an "Underlying
model" line in the review step's Technical details, for new and edited agents
alike. The agent page's overview names the model the same way, with the model
it runs below the name instead of in its place.
