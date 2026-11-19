---
'@giantswarm/backstage-plugin-ui-react': patch
'@giantswarm/backstage-plugin-flux-react': patch
---

The launch icon of a link or button that opens a new tab stays on the line of its text's last word instead of wrapping onto a line of its own (`ExternalLink`, `ExternalButtonLink`, `NewTabLabel`, through the new `WithNewTabHint`). flux-react's `useGitOpsSource` also returns the Kustomization and GitRepository it read, as `resources`.
