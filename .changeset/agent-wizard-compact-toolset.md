---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Tools step: a change below a preset no longer writes the preset out tool by
tool. While everything the preset covers stays chosen, the toolset is stored as
the preset plus what was added (for example `preset:read-only` +
`server:agent-manager`), so read-only access everywhere plus full access to one
connector fits the 32-selector limit. Only taking part of a preset away writes
it out, because selectors cannot subtract. A toolset that is a preset plus more
now shows both in _Which apps?_. Over the limit, the error names the connectors
that list the most selectors instead of asking for a preset.
