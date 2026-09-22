---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Format the Agent Platform's counts, USD amounts and tokens-per-second figures
with `en-US` thousands grouping on every browser, instead of the browser's
locale. The decimal mark in these figures was already fixed (`$4.50`, `1.5k`,
`4.3%`), so a browser set to another locale showed `$4.50` next to `$1.235` in
the same column. Nothing changes for an `en-US` browser.
