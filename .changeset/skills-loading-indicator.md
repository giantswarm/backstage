---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

Show a progress bar while the skill catalogue is being discovered.

Discovering skills means reading every configured skill repository, which takes a
few seconds on a cold cache. The Select skills step of agent creation and the
skill picker on the Edit agent page both showed a single line of grey text while
that ran, so the page looked static. They now render an indeterminate progress
bar above that line.

New `LoadingIndicator` export in `ui-react`: a `Progress` bar plus a muted label,
for a region that has nothing to show yet. The bar is held back for 250ms, so a
query that resolves from cache — which the Select skills step arranges by warming
the catalogue on step 1 — does not flash one.
