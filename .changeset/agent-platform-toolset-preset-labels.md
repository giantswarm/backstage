---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Toolset presets are shown by their label — *Read-only tools*, *No tools*,
*Full gateway* — instead of their selector (`preset:read-only`) in the agents
list's Toolset column, on the agent's Toolset card, in the edit form and on the
create flow's Tools and Review steps. The selector stays in view as the second
line, the row's meta or the chip's tooltip. A preset without a label (one the
installation defines), and server, workflow and tool selectors, are shown as
written.
