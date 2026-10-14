---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Customize › Agents explains an empty or incomplete list again. A fleet that
answered with no agent, and has an environment that can take one, shows "No
agents yet" with "Create your first agent". An environment in scope without
kagent shows "kagent is not installed on <environment>" (or "on any
environment") with "Go to Installations"; one that could not be asked whether
it runs kagent shows the inventory gate with its remedy; and where no
environment in reach runs kagent the tab says "No agents to list". While more
environments are still read, a thin "Loading more agents" bar sits above the
list in a slot that keeps the list in place.
