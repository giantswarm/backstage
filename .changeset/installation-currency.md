---
'@giantswarm/backstage-plugin-gs': minor
---

Add `gs.installations.<name>.currency` (`code`, and `usdRate` for any code but USD) to choose the currency the Agent Platform shows an installation's costs in, and export its type `InstallationCurrency`. Without it, costs stay in USD.
