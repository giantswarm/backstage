---
'@giantswarm/backstage-plugin-muster': patch
---

The shell's Add connector wizard no longer covers the whole screen. Its three
steps (Connect, Sign-in, Test) render in the content area through the shared
`WizardFrame`, so the rail stays visible and usable while a connector is added
or edited; the step strip, the centered column and the sticky
Cancel/Back/primary footer are unchanged in substance. The steps' headings now
come from the shared `WizardStepHeading`, and the wizard's option cards and
textarea field are the shared ui-react primitives the create-agent flow uses
too, so the creation flows read as one system.
