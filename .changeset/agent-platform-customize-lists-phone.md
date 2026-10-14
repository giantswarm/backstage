---
'@giantswarm/backstage-plugin-agent-platform': patch
'app': patch
---

Customize's Agents, Skills and Models tabs fit a phone. Models drops the Used by column at phone width, and its count joins the model's line ("Anthropic · claude-sonnet-4-5 · Used by 2 agents"); the status column keeps room for its label. Agents wraps a long name, the description and the facts instead of cutting them, says inline why an agent that is not Ready needs a look, and gives the star a 44px target. A skill card breaks a long name inside the card. The tab's search and its create action (New agent, Add connector, Connect a model, Add skill) take a full-width line each on a phone, instead of the action wrapping under the search, left-aligned.
