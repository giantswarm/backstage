---
'app': minor
---

Add the `agent-platform-shell` feature flag: when a user turns it on, the classic sidebar is replaced by the Agent Platform rail (New session, Sessions, Customize, Usage, recent sessions and a profile menu).

Under the flag, `/` is the new-session screen (a greeting and the session composer) instead of the classic home page, and `app.rootRedirect` does not apply.

Under the flag, the portal uses the Agent Platform look in light mode: Roboto, navy text and primary colour, white background and blue links (Roboto applies in dark mode too). The rail opens with the Giant Swarm mark and the Agent Platform name, linking home, and in light mode the rail, its items, the avatar, status colours and menus take the Agent Platform palette, as do toggle chips, badges and tags, the composers, selectable cards, recent-session titles, chat text and the dots of completed and neutral session states.

Under the flag, the Agent Platform page shows no tab strip and a session's page no session switcher of its own: the rail navigates between them.

Under the flag, the rail's Customize item opens `/customize`, a tabbed screen (`/customize/:tab`) with a tab per area — Agents, Skills, Connectors, Models and Workflows — each showing its count in the tab strip. Every tab has a search field, an Environment selector where the area is per-installation, an Organization filter on Agents and Models, and a create action where one exists (New agent, Add connector, Add model). The Skills tab hides when no skill repositories are configured, and `/customize` opens the first tab.
