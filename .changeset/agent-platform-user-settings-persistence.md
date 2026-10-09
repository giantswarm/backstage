---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Per-user, roaming user state: the portal's StorageApi now persists to the new `@backstage/plugin-user-settings-backend` (registered in the backend, `UserSettingsStorage` override in the app), so remembered UI state follows the person across browsers and devices instead of living in localStorage. Two new hooks ride it: `usePinnedSessions` (bucket `agent-platform`, key `pinnedSessions`) and `useFavoriteAgents` (key `favoriteAgents`) each return `{ pinnedIds, isPinned, togglePin }`, keep every mounted instance in sync through the storage subscription, and store references (`{ installation, sessionId }` / `{ installation, name, namespace }`) that are re-resolved against the live fleet. No UI consumes them yet — the pin and favorite controls land with the shell workstreams.
