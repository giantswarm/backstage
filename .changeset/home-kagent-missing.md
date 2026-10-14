---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-gs': minor
---

Home explains an empty agent picker the way Customize › Agents does. When
every environment in scope answered without kagent, the new-session composer
gives way to the same "kagent is not installed on <environment>" card with "Go
to Installations", instead of "No agents are deployed on the reachable
environments." Where the environments that run kagent are switched off in
Cluster access, where none in reach runs kagent, and where the portal knows no
environment, Home says Customize's sentence; where an environment could not be
asked whether it runs kagent, Home leaves it to the same inventory gate,
including for an environment other than home. `useAgents()` now carries what
both pages read: `kagentMissing`, `kagentSwitchedOff`, `unknownPin` and
`inventoryFailure`.

gs exports `installationsWithComponent` (what the inventory's
`installationsWith` answers) and `installationsSwitchedOffWithComponent`, next
to `installationsWithoutComponent` and sharing its test of whether an
installation runs a component.
