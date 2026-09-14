---
'@giantswarm/backstage-plugin-ui-react': patch
---

`ConfirmDialog` takes `isConfirmDisabled`: the confirm button locks while the
caller's own precondition is not met (a dry run still running, a refusal,
nothing that would change), while the dialog itself stays dismissable.
