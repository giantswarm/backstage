---
'app': patch
---

The StorageApi override is scoped to the agent platform: only the
`agent-platform` bucket (pinned sessions, favorite agents, dismissed hints) is
kept per user in `@backstage/plugin-user-settings-backend`. Every other bucket
(starred entities, home-page visits, …) stays in the browser's localStorage as
with Backstage's default storage, so the classic portal keeps its behaviour and
its data. Nothing is migrated between the two.
