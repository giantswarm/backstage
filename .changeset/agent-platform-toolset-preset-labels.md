---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Toolset presets are shown by their label — _Read-only tools_, _No tools_,
_Full gateway_ — instead of their selector (`preset:read-only`) in the agents
list's Toolset column, on the agent's Toolset card, in the edit form and on the
create flow's Tools step. The selector stays in view as the second line, the
row's meta or the chip's tooltip. Server, workflow and tool selectors are shown
as written.
