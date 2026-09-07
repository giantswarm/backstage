---
'@giantswarm/backstage-plugin-muster': minor
---

`filterTools` learns the toolset arguments and exports the pieces the agent creation Tools step builds on.

- `filterTools({ toolset, includePresets })` sends one `toolset=` entry per selector and `include_presets`; `FilterToolsResponse` gains `toolset` (echo), `toolset_unmatched` and `presets`; `ToolSummary` / `ToolDetail` gain `server`, `kind` and the forwarded `annotations` (read-only, destructive, idempotent, open-world hints). All optional — absent from an aggregator that predates toolsets.
- Exported for other plugins: `ServerSignIn`, `useServerSignIn` (and their types) plus the `filter_tools` / `list_tools` types.
