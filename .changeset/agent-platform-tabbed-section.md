---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Turn Agent Platform into a tabbed section at `/agent-platform` with two
top-level tabs: **Agents** (`/agent-platform/agents`) and **MCP Servers**
(`/agent-platform/muster`, contributed by the muster plugin). The page now uses
`PageBlueprint` + `SubPageBlueprint` tabs instead of a bespoke router, so the
single section header is owned by the app's page layout.

- The Agents tab is a stub landing plus the create flow
  (`/agent-platform/agents/new` and `.../new/review`).
- The create flow no longer renders its own header; its Cancel / Review actions
  are surfaced in the section header via the new
  `useProvidePageHeaderActions` slot from `ui-react`.
