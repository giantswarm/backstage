---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Agents: after a Deploy from the New agent wizard, the Agents list polls every 5 s until it lists the new agent (for up to three minutes), so the roster shows it within seconds of its `Agent` existing instead of after the one-minute poll.
