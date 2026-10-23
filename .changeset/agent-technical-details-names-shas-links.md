---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-gs-common': minor
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-flux-react': patch
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-gs-backend': patch
'@giantswarm/backstage-plugin-repositories': patch
'@giantswarm/backstage-plugin-platform-capabilities': patch
'@giantswarm/backstage-plugin-bot-prs': patch
---

The agent page's Technical details drop the Resource card's "Copy system
prompt" button, show the agent's namespace and name as two facts, Namespace
and Name, and link each skill version to its skill's page. The model and
connector pages' Technical details split their resources the same way; a
reference in the agent's own namespace (its ModelConfig, a sub-agent, the
HelmRelease behind it) is named alone. The Configuration card's "See tools" is
bui's link.

Every git SHA the portal shows is 7 characters, with the full value as its
title and a copy button on touch screens: skill pins and versions, agent
revisions, workspace heads, Flux revisions and versions that carry a commit,
the release footer, scaffold and revert commits, and the backend's messages.

New in `gs-common`: `shortSha`, re-exported by `ui-react`. New in `ui-react`:
`CommitSha` and `namespacedNameFacts`.
