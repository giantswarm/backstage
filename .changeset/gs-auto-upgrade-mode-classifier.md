---
'@giantswarm/backstage-plugin-gs': patch
---

The deployment page's About card and Edit button agree on the automatic upgrades mode: a range that admits exactly a fixed mode's upgrades from the current version, such as `>=5.12.0 <6.0.0` or `>=0.2.0 <1.0.0`, pre-fills the edit template with that mode instead of a custom version range.
