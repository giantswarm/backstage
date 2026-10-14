---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Home explains a missing kagent the way Customize › Agents does. When every
environment in scope answered without kagent, the new-session composer gives
way to the same "kagent is not installed on <environment>" card with "Go to
Installations", instead of "No agents are deployed on the reachable
environments." When the environments that run kagent are switched off in
Cluster access, Home names them with Customize's sentence ("<environment> runs
kagent but is switched off in Cluster access, so its agents are not read.").
`useAgents()` now carries both states, as `kagentMissing` and
`kagentSwitchedOff`, which both pages read.
