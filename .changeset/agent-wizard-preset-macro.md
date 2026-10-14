---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Tools step: a preset now sets the selection instead of being a base to add
to. Picking one shows what it covers in _Which apps?_ and the individual tools
(Read-only, All or "k of N selected" per connector) while the toolset stays the
preset. The first change there writes the preset out as concrete selectors,
applies the change and switches to _Only the tools I choose below_. A toolset
that is a preset plus more opens as _Only the tools I choose below_, unchanged.
Full gateway keeps the selection below turned off.
