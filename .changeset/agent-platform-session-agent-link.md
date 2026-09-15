---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The agent's name in a session's header now links to that agent.

A session page named the agent that ran it but offered no way to reach it — the
only route to the agent's own page was back through the Agents tab. The name is
now a link, so a conversation leads to the agent's configuration, tools and
skills in one click.

It stays plain text when no `Agent` resource matched the session, which is the
case for an agent that has since been deleted: the name shown there is a decode
of the session's stored agent id and names nothing that can be looked up.
