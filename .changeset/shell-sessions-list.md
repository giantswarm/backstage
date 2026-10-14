---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Under the `agent-platform-shell` flag, the Sessions page is titled "Sessions" with a "New session" button, and its list shows one table per day the sessions started (Today, Yesterday, Earlier), states in the shell's words (Waiting for you, Working, Finished, Failed) with a coloured dot, state chips with counts, an agent filter labelled "Agent" beside the search, search by title or agent, and a menu per row to rename or delete the session. The list shows 25 sessions at a time, with "Load more" for the next 25; deleting a session moves focus to the next row. Without any session the page says so and links to a new session. Deleting a session from the list itself no longer navigates to the list a second time. Without the flag the Sessions page is unchanged.
