---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

`ShellPage` and `FullScreenWizardFrame` now claim the page header with the new `useOwnPageHeader` hook, and a layout reads `usePageHeaderOwned` to draw no header of its own. Under the `agent-platform-shell` flag, every Agent Platform page that renders a `ShellPage`, such as the Sessions list and a connector's page, shows one title and each header action once.
