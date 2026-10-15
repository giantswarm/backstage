---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

The model page splits into Overview, Usage and Used by tabs, each its own
address under the model's, in one column. Overview holds the serving status,
the facts that sat beside the page (with a "Managed by" fact for a model a
tool owns, in place of the banner), then the Technical details fold-out. Usage
holds the gateway's 30-day figures and the spend per day. Used by, counted in
the tab as on the skill page, lists the agents as the skill and connector pages
do, each linking to its page with its spend on the model at the row's end. A
model agents cannot use yet says why at the top of Overview, in plain words
taken from the condition that actually failed: what is wrong and what to do,
with kagent's reasons left to the Technical details, which open on arrival and
which the alert's Show conditions reveals. Its status reads Incomplete when
kagent accepts its settings but cannot find what they refer to, such as the key,
and Not accepted only when kagent rejects the settings. For a Helm-rendered model,
Technical details show the owning HelmRelease: its chart, version and state,
linked to its deployment page.

`ConditionsList` writes each condition's status, reason and message as a
label/value list, as the rest of the technical details are.

`FoldOutAlignedSection` insets a Details tab's facts as `TechnicalDetailsFoldOut`
insets its title; the connector and workflow Details tabs and the model
page's Overview share it.

`TechnicalDetailsFoldOut` takes a ref with `reveal()`, which opens it, scrolls
it into view and focuses its trigger.

`ModelConfig.getFailedCondition()` returns the condition that failed, in the
order kagent evaluates them.
