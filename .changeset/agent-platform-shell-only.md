---
'app': minor
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-agent-platform-common': minor
---

The Agent Platform lives in the agent shell only. Its pages (`page:agent-platform`
with its sections, muster's Connectors and Workflows among them,
`page:agent-platform/skills`, `page:agent-platform/profile` and muster's
`/agent-platform/mcp-servers` redirect) carry the new `AGENT_SHELL_ON`
extension predicate from `agent-platform-common`, so they are mounted only
where the shell is available (`app.portals.agentPlatform`, or a person's
`agent-platform-shell` opt-in).

- **Agent Platform off** (`app.portals.agentPlatform` unset or `false`): the
  classic portal has nothing of the Agent Platform — no sidebar item, no
  `/agent-platform/**` route, no classic-chrome Agent Platform page — even
  where `app.extensions` lists `page:agent-platform`. Deployments that used
  the classic-chrome Agent Platform section lose it by design.
- **Agent Platform on**: `/agent-platform/**` always renders in the shell; the
  classic sidebar carries only an **Agent Platform** link to `/agent-platform`
  (a new tab while the classic portal is served), and the shell's **Platform
  Portal** item links back.

The classic-chrome rendering of `page:agent-platform` (its header and tab
strip) is gone. Create cluster and Delete cluster on the classic Clusters
pages are unchanged.
