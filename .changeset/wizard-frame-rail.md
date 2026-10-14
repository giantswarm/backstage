---
'@giantswarm/backstage-plugin-ui-react': patch
---

`WizardFrame` takes a `rail`: a sticky panel docked to the right of the step at
the two-column tier when the step keeps at least 400px beside it.
`useWizardFrameRail()` tells the step whether it is docked, so it can show a
narrow fallback instead.
