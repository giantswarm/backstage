---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-ui-react': patch
---

The model page splits into Overview, Usage and Used by tabs, each its own
address under the model's, in one column. Overview holds the serving status,
the facts that sat beside the page (with a "Managed by" fact for a model a
tool owns, in place of the banner), then the Technical details fold-out. Usage
holds the gateway's 30-day figures and the spend per day. Used by, counted in
the tab as on the skill page, lists the agents as the skill and connector pages
do, each linking to its page with its spend on the model at the row's end. A
model the controller has not accepted says why in an alert above every tab,
and its Technical details open on arrival. For a Helm-rendered model,
Technical details show the owning HelmRelease: its chart, version and state,
linked to its deployment page.

`ConditionsList` writes each condition's status, reason and message as a
label/value list, as the rest of the technical details are.

`FoldOutAlignedSection` insets a Details tab's facts as `TechnicalDetailsFoldOut`
insets its title; the connector and workflow Details tabs and the model
page's Overview share it.
