---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The Agent Platform moves to URLs that follow the shell's rail
(giantswarm/giantswarm#38510): Sessions, Usage and Profile are `/sessions`,
`/usage` and `/profile`; an agent, a skill and a model sit under their
Customize tab, at `/customize/agents/<installation>/<namespace>/<name>`,
`/customize/skills/<owner>/<repo>…` and
`/customize/models/<installation>/<namespace>/<name>`, with their create
flows at `…/new` and their edits at `…/edit` (skills keep
`/customize/skills/edit/…`). Model hosting is
`/customize/models/hosting[/capacity|/cache]`, with Running models at its
bare path, and Usage's Overview is the bare `/usage`. An unknown address
under any of them lands on its nearest valid page. Every old
`/agent-platform/…` and `/agents/…` address redirects to its new place in one
hop until the end of 2026.

The Agents, Skills and Models tabs are sub-pages of the app's Customize page
(`page:app/agent-shell-customize`); Sessions, Usage and Profile are pages of
their own (`page:agent-platform/sessions`, `page:agent-platform/usage`,
`page:agent-platform/profile`), all enabled by default. New exported routes:
`modelDetail`; `usageOverview` is gone (Overview is `usage` itself). The muster
external routes take the installation as a path parameter.
