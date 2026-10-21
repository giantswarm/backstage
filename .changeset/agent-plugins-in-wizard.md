---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-gs-backend': minor
---

The agent wizard's skills step lists the plugins found in the configured skill
repositories, each pinned to the commit its card shows: a Claude Code plugin
(`.claude-plugin/plugin.json`) is picked whole, an Agent Plugins package
(`plugin.json` at its root) by the skills it enables. The step warns when a
skill name is picked twice, the review names each plugin with what of it loads,
and an edit keeps the agent's plugins at their pins. `GET /agent-skills`
answers the repository's `plugins` next to its skills, from the same tree read.
