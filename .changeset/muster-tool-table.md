---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

New `ToolTable` component: the house list of tools, as a table of name, markers
and description without a header row.

Five near-identical tool lists had grown across the two plugins — the Tool
Explorer's browse rows, an agent's resolved toolset, muster's `ToolList`, the
toolset picker's rows, and the servers page's chips — in four spellings of the
tool name across three sizes, and five treatments of the summary. Only two of
them showed the read-only / destructive markers their servers annotate, and the
Tool Explorer, the one surface that actually _runs_ a tool, was not among them.

`ToolTable` is one component behind all of them. What differs between surfaces
is a row's `mode` — shown, linked, selectable (the whole row opens the tool) or
checkable — not its typography. It is presentational: it renders exactly the
items it is given, and grouping, searching and paging stay with the caller.
Columns are a CSS grid on the list with `subgrid` on each row, so they line up
without a header, and the marker column only exists when some row in the list
can fill it.

The `isReadOnly` / `isDestructive` annotation predicates moved to the muster
plugin, where `ToolTable` needs them too; `agent-platform`'s `lib/toolset`
re-exports them unchanged, so its callers are unaffected.

Every one of those lists now renders through it: the servers page's core tool
families (`ToolList`, deleted), the resolved toolset behind the agent detail
page, the Tools step, the review page and the edit page, the Tools step's
catalogue, and the Tool Explorer's browse, search and quick-access lists. The
Tool Explorer and the core families show read-only and destructive markers for
the first time — the surface that actually runs a tool was not telling anyone
which tools destroy things.

The servers page's inline chips stay as they are: a dense jump-off surface, not
a read-and-compare list, and a different affordance rather than a different
styling of the same one.
