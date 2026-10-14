---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Customize → Agents gets its personal layer:

- A star on every agent row adds it to, or removes it from, your favorites
  (stored per person in user settings). Favorites are listed in a group of
  their own above the other agents; both groups render 25 rows at a time.
- "Last used by you": up to three cards for the agents of your latest
  sessions, each opening a new session with that agent.
- A helper banner pointing at the agent configured as
  `agentPlatform.metaAgents.generalInformation`, whose button opens a new
  session with it. Hidden when the role is unconfigured or its agent cannot
  be started; dismissible for good.
