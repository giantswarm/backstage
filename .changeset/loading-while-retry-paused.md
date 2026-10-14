---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ai-chat': patch
'@giantswarm/backstage-plugin-bot-prs': patch
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-kubernetes-react': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-plans': patch
'@giantswarm/backstage-plugin-repositories': patch
'@giantswarm/backstage-plugin-roadmap': patch
---

A page whose first read failed no longer says "No items" while the retry
waits for the tab to come back to the foreground: it shows its loading state
until the retry answers, then the data or the error. `isAwaitingData` in
`ui-react` is the shared check (no data yet, fetching or waiting to retry),
used in place of react-query's `isLoading`, which is false while a retry is
paused.
