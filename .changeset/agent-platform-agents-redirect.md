---
'@giantswarm/backstage-plugin-agent-platform': patch
'app': patch
---

`/agents` (and anything below it, query and hash kept) redirects to the same place under the Agents tab, `/agent-platform/agents`, instead of answering 404. Where the Agent Platform section is not enabled, `/agents` stays a not-found page.
