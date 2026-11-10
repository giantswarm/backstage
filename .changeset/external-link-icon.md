---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-repositories': patch
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-plans': patch
'@giantswarm/backstage-plugin-roadmap': patch
'@giantswarm/backstage-plugin-bot-prs': patch
'@giantswarm/backstage-plugin-platform-capabilities': patch
---

Every link and button that opens a new tab marks it the same way: the launch icon after its text and "(opens in a new tab)" for a screen reader, in place of the "↗" some of them ended in (Review pull request, Edit on GitHub, View on GitHub, the sign-in buttons, All portal settings, the release line, How it works, How alignment works, Workflow runs, the repository phase links). `ui-react`'s `ExternalLink` is now bui's `Link` (always underlined, bui's focus ring) and takes an optional `variant` and `title`; without a `variant` it keeps taking the surrounding font, and off the agent shell it keeps the classic link colour. `ui-react` adds `ExternalButtonLink` (bui's `ButtonLink` with that treatment) and exports `NewTabHint` and `NewTabLabel` (a button label followed by the hint). `ExternalCellText` and `GSReleaseInfo` are built on `ExternalLink`. A skill page's Path links to the SKILL.md on GitHub at the latest commit, and the Instructions file viewer links a file at the commit it was read at, naming no commit when there is none.

Every text link to outside the portal now opens in a new tab and shows the icon, including the ones that showed nothing before or another external-link icon: docs, GitHub pull requests, commits, releases and issues, Grafana dashboards and endpoints, hostnames, Teleport, PagerDuty, sign-in pages, and the links in rendered markdown (`GSMarkdownContent` renders an `http(s)` link to another origin as an `ExternalLink`). `ui-react` exports `isExternalHref` for telling such a link apart.
