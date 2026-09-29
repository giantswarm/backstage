---
'@giantswarm/backstage-plugin-repositories': minor
---

The row action _Configure_ is _Edit_, and its dialog is the Create form
rather than a YAML box: the entry opens as Create repository shows a
declaration -- description and visibility, the preset it matches with the
declaration line and _Adjust_ for the raw controls, the opt-in to alignment
(`align`) and the reason -- with the team and the name fixed (Transfer moves a
repository; a rename is followed by the reconciler). `update_repository` still
takes the entry whole: the form's fields are replaced, and every field the
form does not carry (lifecycle, system, choreReviewers, the knobs under
`gen.ci`, …) stays as it was and is named on the form. The Create form's
declaration line names an unset language or flavours instead of leaving a
gap, and its raw controls open by themselves when the generator's rule is
broken.
