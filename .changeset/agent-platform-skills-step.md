---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Move skill selection out of the "Create an agent" form and into its own step
(`/agent-platform/agents/new/skills`, between Details and Review). As
configured skill repositories grow — one already holds 100+ skills across many
plugins — a single flat grid of cards on the create form no longer scales.

The new step groups skills by repository, then by subfolder (e.g. `claude-code`'s
per-plugin `skills/` directories), and adds a search field that matches on
name, description, and path. Repos or skills with no meaningful subfolder
render flush, without a synthetic "General" heading.

Search filters _within_ the grouping rather than replacing it with a flat list:
which repo and subfolder a skill came from is part of what identifies it, so
results keep that context, and the page doesn't relayout on the first
keystroke. Repos and subgroups with no matches simply don't appear.

Each of the three steps now shows a "Step X of 3" label. The "Create an
agent" page's Configuration card no longer includes the skill picker field.
