---
'@giantswarm/backstage-plugin-roadmap-backend': patch
---

Make roadmap board loads fast: the items cache is now stale-while-revalidate
with a five-minute TTL (an expired entry is served instantly while one
background refresh updates it), the default team view is warmed on startup
and kept warm, field writes patch the cached lists in place instead of
forcing a full board rescan, and `GET /items/by-issue` resolves an issue via
one targeted issue->projectItems GraphQL call instead of paginating the
entire board.
