---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Add a minimal in-shell "Profile and settings" page at `/agent-platform/profile`:
who is signed in (name, email, avatar), the installations the portal talks to,
and Sign out. The shell rail's profile menu now links here in the same tab
instead of jumping into the classic `/settings` chrome, and its "Feature flags"
item is gone — not relevant inside the Agent Platform. The classic settings
stay reachable through the page's explicit "All portal settings" link, which
opens the Platform Portal in a new tab per the shell's cross-link convention.
