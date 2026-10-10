---
'@giantswarm/backstage-plugin-ui-react': patch
---

The create flows' Cancel / Back / Continue bar (`WizardFrame`) keeps one position: at the bottom of the view even when the step is short, and docked there while a long step scrolls behind it. At phone width it sits above the agent shell's bottom navigation instead of behind it.
