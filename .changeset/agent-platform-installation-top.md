---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

Move the Installation picker to its own card at the top of the "Create an
agent" form (`/agent-platform/agents/new`), ahead of Identity and
Configuration, since the avatar preview and model picker both depend on it.

When only one installation is configured for access, the picker is hidden
entirely and that installation is auto-selected — customer Backstage
instances wired to a single management cluster no longer see a single-option
dropdown with nothing to choose.

`ui-react`: add the shared `SectionHeader` component (title + description
pair used to introduce a card's contents), extracted from the agent-platform
form so it can be reused across plugins.
