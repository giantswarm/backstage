---
'@giantswarm/backstage-plugin-ui-react': patch
---

`RouteTabs` scrolls sideways wherever its tabs don't fit, not only at phone width, so a narrow window beside the shell's rail no longer cuts off the last tabs. `WizardFrame` keeps its title 320px of room beside the steps, which wrap to a row of their own below that instead of squeezing the title.
