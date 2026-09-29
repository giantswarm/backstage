---
'@giantswarm/backstage-plugin-platform-capabilities': patch
---

The Installations table shows a capability the installation's owners enabled
themselves, without the manager's opt-in, as installed but not reconciled
(the blue sync mark) instead of not installed: the manager's state
`enabled, not opted in` says the fileset is on record and the manager may
not write to it; only `not enabled` and `not opted in`, where nothing is on
record, keep the empty circle. The Capabilities tab reads "Installed" for it
with its comparison, names the owners' file as before and keeps the button
disabled. The dev harness has a row for the state.
