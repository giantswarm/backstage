---
'@giantswarm/backstage-plugin-muster': minor
---

Add connector keeps the name typed into its Name field as the connector's
display name (the `ui.giantswarm.io/display-name` annotation), so "Stack
Overflow" is shown as typed while it is still registered as `stack-overflow`.
A name that is the technical name already (`jira`) sets none. Editing a
connector shows its display name in the Name field and lets it be changed; the
technical name stays fixed. Installations whose muster is older than v5.43.0,
which takes no display name, register and edit as before.
