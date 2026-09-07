---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The agent creation Tools step no longer renders the whole gateway catalogue at
once. On an installation with a few hundred tools the page ran to about fifty
screens before the author could see what their choice resolved to: every
workflow was a full card carrying its whole description, muster's core tools
were expanded by default, the search box sat below the first fold and the
selected toolset with its resolved list closed the page.

Now the presets come first as the primary path, followed by a **sticky
"Selected so far" bar** with the selectors as removable chips and the live
resolved count ("Resolves to 51 tools for you", with the sign-in, unmatched
and unknown-preset hints in short form) and a jump to the full list. The
**catalogue is collapsed behind a "Browse the catalogue" toggle** and a
one-line inventory; its **search box stays visible** and typing opens only the
groups with matches. Infrastructure, Agent Platform, Registered servers and
Workflows are **accordions collapsed by default with counts**; servers inside
are rows that open to their tools; _Platform administration_ is its own
warned, collapsed entry. Tools and workflows are **compact rows** (name,
markers, one truncated line of the description) and every list shows its
first 20 rows with a _Show all N_ button. **Workflows are grouped by the
leading segment of their name** (`cert-manager`, `mc`, …), singletons under
_Other workflows_, each group collapsed with its count — the one structure a
workflow catalogue reliably carries, since neither `filter_tools` nor
`core_workflow_list` exposes a workflow's steps.

The resolved list (Tools step, review step and the agent page's Toolset card)
groups workflows the same way and pages its rows too. New shared pieces:
`SelectableRow` / `SelectableRowList` next to the cards, and `ShowMore`.
Everything the step did before stays: nothing selected at start, `none` and
`full` exclusive, the inline per-server sign-in, whole-server selection
without a sign-in flagged, the cap of 32 inline selectors, copying another
agent's toolset, selectors typed by hand, and the degradation against a muster
that does not evaluate toolsets or a portal without the muster plugin.
