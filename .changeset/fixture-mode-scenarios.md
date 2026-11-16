---
'@giantswarm/backstage-plugin-gs-common': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-gs': patch
'@giantswarm/backstage-plugin-flux': patch
---

Fixture mode serves scenarios, outside production builds only: `?fixtures=empty`, `many`, `long-names`, `loading` or `error` on any page switches the data set of the Agent Platform's and the Kubernetes fixture APIs without a restart, and `?fixtures=base` goes back. In `error`, muster fails with its own signed-out, unauthorised and unreachable errors. The persisted query caches of another scenario are never restored.

The Toolchains tab and the New toolchain page say "Toolchains could not be checked" when no environment's Muster could say whether it runs the toolchain-manager, with why (a refused sign-in, an ended session, no answer) and a Retry, instead of reading forever. muster's `useMusterServerAvailability` reports each installation's error (`errorOf`).
