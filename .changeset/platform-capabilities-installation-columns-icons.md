---
'@giantswarm/backstage-plugin-platform-capabilities': minor
---

The Installations table's capability columns (`agent-platform`,
`customer-portal`) show one icon per installation instead of the state as
text: a green check where the capability is installed and the manager's
last action verified it as defined, an orange sync-problem where the last
verify found it off its definition, a blue sync where it is installed or
under way but the manager has not reconciled it yet (an action in flight, or
an installation enabled by hand that no action has run through), an empty
circle where it is not installed (not enabled, or not opted in), a red error
where the last action or verify failed, and a question mark where the
installation is not readable as the person. The manager's state in its own
words is the icon's tooltip and accessible name; the column header's tooltip
is the legend. The Capabilities tab and the Consistency views keep the
states as text.
