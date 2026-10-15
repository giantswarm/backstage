---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-ui-react': patch
---

The model page splits into Overview, Usage and Details tabs, each its own
address under the model's, in one column. Overview holds the serving status,
the "Managed by" and "not editable here" notes, and Used by, which lists the
agents as the skill and connector pages do, each linking to its page with its
spend on the model at the row's end. Usage holds the gateway's 30-day figures
and the spend per day. Details holds the facts that sat beside the page, then
the Technical details fold-out. A model the controller has not accepted says
why in an alert above every tab, with a link to its conditions on Details.

`ConditionsList` writes each condition's status, reason and message as a
label/value list, as the rest of the technical details are.

`FoldOutAlignedSection` insets a Details tab's facts as `TechnicalDetailsFoldOut`
insets its title; the connector, model and workflow Details tabs share it.
