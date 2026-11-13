---
'@giantswarm/backstage-plugin-gs': minor
---

Add `SharedInstallationScope`. Only below it does `useInstallationScope` read the environment chosen in an Environment selector. There is one choice for Customize (the default, stored as `muster-installation`) and one for Usage (`id="usage"`, stored as `usage-installation`), and neither reads the other. Elsewhere `useInstallationScope` reads every environment, so pages without a selector, such as Bot PRs, no longer follow a choice made on Customize.
