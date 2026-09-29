---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Sessions list: drop the Last activity column, which kagent API v2 never updates
after a session starts, and sort by start instead; the session page drops "last
activity" and Duration for the same reason. Pressing Start or Enter with no agent
chosen now says so and focuses the picker instead of doing nothing. The list has
its own "Your sessions" heading and drops the intro line above the page, session
titles stay on one line in a wider column, and with one installation pinned (or
only one running kagent) the Installation column is left out. A session whose
state was not read says "Not loaded" rather than showing a dash, a search with
no match names the term, and the migration notice no longer mentions kagent
internals.
