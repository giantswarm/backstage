---
'@giantswarm/backstage-plugin-gs': minor
---

Add `SharedInstallationScope`. Only below it does `useInstallationScope` read the environment chosen in an Environment selector. Elsewhere it reads every environment, so pages without a selector, such as Bot PRs, no longer follow a choice made on Customize.
