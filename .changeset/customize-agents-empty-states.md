---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-gs': minor
---

Customize › Agents explains an empty or incomplete list again. A fleet that
answered with no agent, and has an environment that can take one, shows "No
agents yet" with "Create your first agent". An environment in scope without
kagent shows "kagent is not installed on <environment>" (or "on any
environment") with "Go to Installations"; one that could not be asked whether
it runs kagent shows the inventory gate with its remedy; a pinned environment
the portal does not know reads "Unknown environment"; and where no environment
in reach runs kagent the tab says "No agents to list", naming any environment
that runs kagent but is switched off in Cluster access. While more
environments are still read, a thin "Loading more agents" bar sits in the gap
above the list without moving it.

gs exports `installationsWithoutComponent`, the one rule behind "<component>
is not installed on <installation>", which `InstallationScopeNote` now uses
too.
