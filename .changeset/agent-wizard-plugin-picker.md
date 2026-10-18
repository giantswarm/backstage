---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-gs-backend': minor
---

The agent wizard's skills step picks plugins too ("Select skills and plugins"): every plugin in the configured skill repositories is a card, pinned to the commit it shows. A Claude Code plugin loads whole; an Agent Plugins package lists its skills as checkboxes, all of them enabled at first. A skill name enabled twice blocks Continue. Edit keeps the agent's plugins as pinned, and both reviews list the plugins and their pins. `GET /agent-skills` answers the repository's `plugins` beside its `skills`.
