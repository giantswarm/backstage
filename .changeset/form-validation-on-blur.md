---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
---

Form fields in the Agent Platform are now checked when you leave them, not
only when you press Continue or Submit: a field you typed in shows its
problem as you move on, an empty field you only tabbed through stays quiet
until you submit, and a shown error clears the moment you fix it. Submit still
shows every remaining problem and moves the focus to the first.

`useFieldValidation` tracks each field: `errorFor(field, problem)` takes the
field's name; `blurProps(field, problem, value?)`, `textFieldProps(field,
problem)` and `fieldProps(field, problem)` check a field when it is left (a
blur caused by pressing a button waits until the press is over); errors
announce through a polite live region; and `shown` is renamed `submitted`.
`TextAreaField` passes `onFocus` and `onBlur` through and announces its error
live only past its character limit.
