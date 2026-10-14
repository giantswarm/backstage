---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The Customize screen's Agents and Skills tabs follow the prototype's presentation again instead of a table. Agents is one rounded list with a row per agent: its avatar, name and what it is for, then its model, its skills and connectors, and its environment when there is more than one; the state shows next to the name only when the agent is not ready (a ready agent's state stays on its own page). Skills is a grid of cards under a tinted note, most used first, each card showing what the skill does, its source repository and how many agents use it, and opening the skill's page. Both stack at phone width. Connectors, Models and Workflows keep their tables, which is how the prototype draws them too.
