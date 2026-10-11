---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Starting a session no longer flashes "Could not load this session" on the way to the conversation: the session page now shows its loading state while the cached data is restored, and retries a just-created session's first reads for a few seconds before reporting it missing or unreadable.
