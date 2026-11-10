---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-repositories': patch
---

Every link and button that opens a new tab marks it the same way: the launch icon after its text and "(opens in a new tab)" for a screen reader, in place of the "↗" some of them ended in (Review pull request, Edit on GitHub, View on GitHub, the sign-in buttons, All portal settings, the release line, How it works, How alignment works, Workflow runs, the repository phase links). `ui-react` adds `ExternalButtonLink`, bui's `ButtonLink` with that treatment, and exports `NewTabHint`. A skill page's Path links to the SKILL.md on GitHub at the latest commit.
