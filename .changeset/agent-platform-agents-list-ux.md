---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-kubernetes-react': patch
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-gs': patch
---

Agents list: the agent name gets most of the width, a search field filters by
name, description and installation, and the intro line above the table is gone.
A status that needs explaining carries an info icon whose tooltip gives the
reason, now the unresolved reference itself (e.g. a missing ModelConfig) rather
than "blocked by ResolvedRefs"; the "on kagent" line under every status is
dropped. The Installation column is left out when the list comes from one
installation, Namespace while every agent shares one, and "No tools" reads as
an absence. A pinned installation without kagent says so with a link to the
Installations page, and "New agent" is disabled there.

ui-react adds `InfoHint`, the info icon with a tooltip that `Stat` already
used. The installation scope selector lists the home installation first and
the rest by name instead of reshuffling as installations answer, and the gs
plugin exposes its Installations page as the `installationsPage` route.
