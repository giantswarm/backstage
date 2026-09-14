---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The agent detail page is split into four tabs — **Overview**, **Tools**,
**Skills** and **Sessions** — instead of one long scrolling page.

The agent's header and, right after a write, its creation progress stay above the
tab strip, so which agent this is and whether it has converged are visible from
every tab. Overview keeps the GitOps card, the configuration, the status and the
system prompt; the toolset, the skills grid and the sessions each get a tab of
their own.

Each tab is its own URL (`…/<name>/tools`, `/skills`, `/sessions`), so a deep link
or a reload lands on the section it names. **Overview is the index**, not a
redirect, so every existing link and bookmark to an agent keeps working unchanged
— including the create flow's handoff to the page.

The Sessions tab now lists all of your sessions with the agent, searchable and
paged, rather than the five most recent with a "View all sessions" link — that
link pointed at the section-level Sessions tab, which lists every agent's
sessions, so it was a different list rather than the rest of this one.

The toolset's muster reads (the tool catalogue, the server list and the toolset
resolution) now happen only when the Tools tab is opened, instead of on every
visit to the page.
