---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Usage → Cost shows spend by organization: a "By organization" table with one
row per organization whose agents the gateway recorded calls for (the
organization's name, `None` for the platform's shared agents, `namespace
<name>` for another namespace, Unattributed for calls placed in no namespace),
with its model calls, tokens, spend and share of spend over the selected
window. An Organization select in the scope bar, kept in the URL as
`?organization=<namespace>`, narrows every figure on Overview and Cost to one
organization; a row of the table opens that view. The Cost caption says the
page covers every organization, for everyone who can read the environment's
metrics. Part of giantswarm/backstage#2672.
