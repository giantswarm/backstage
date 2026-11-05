---
'@giantswarm/backstage-plugin-agent-platform': patch
---

New session keeps an unsent prompt and the chosen agent in the browser tab, so
a reload or a sign-in that leaves the page no longer loses them. The draft is
removed once the session starts.
