---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-bot-prs': patch
---

The muster plugin exports `useMusterServerAvailability` and `musterServerListQueryKey`: which installations' muster lists an MCP server, as the person. The Agent Platform and Bot PRs use it instead of their own copies, so Bot PRs also stops asking an installation the portal cannot reach, backs off after a 503, and no longer offers marge where muster has no per-user sign-in.
