---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': patch
---

Tool approval per agent. The new-agent Tools step and the agent edit get _How it asks_: `Allow · Ask · Block` pills for the list's default, each whole connector and each tool, showing what applies now as muster reports it for the agent (`filter_tools` with `agentTools`). _Allow_ over a connector's _Ask_ is an exception only that connector's admins can give, and nothing offers to lift a built-in or governance _Ask_. A new agent saves through `create_agent`, then `set_agent_approval` for its exceptions; an edit through agent-manager's split `update_agent`, `update_agent_access` and `set_agent_approval`, saying before saving which exceptions a save removes. The agent's Tools tab shows each tool's approval, the Overview a one-line summary, and the connector's Tools tab _Allowed for_ from agent-manager's grants. Works against an older agent-manager and muster as before.
