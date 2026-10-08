---
'app': minor
---

Add the `agent-platform-shell` feature flag: when a user turns it on, the classic sidebar is replaced by the Agent Platform rail (New session, Sessions, Customize, Usage, recent sessions and a profile menu).

Under the flag, `/` is the new-session screen (a greeting and the session composer) instead of the classic home page, and `app.rootRedirect` does not apply.

Under the flag, the portal uses the Agent Platform look in light mode: Roboto, navy text and primary colour, white background and blue links (Roboto applies in dark mode too).

Under the flag, the Agent Platform page shows no tab strip and a session's page no session switcher of its own: the rail navigates between them.
