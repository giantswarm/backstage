---
'@giantswarm/backstage-plugin-ui-react': minor
---

`useFieldValidation()` returns `reset()`, which puts the form back to quiet as before its first blocked attempt — for a form that stays mounted while closed, such as a dialog, so it does not reopen with the last attempt's errors showing. In a dialog, pass a ref inside the dialog's body as the `scope`.
