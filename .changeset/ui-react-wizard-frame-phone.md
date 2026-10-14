---
'@giantswarm/backstage-plugin-ui-react': minor
---

`WizardFrame` fits a phone. At phone width the title sits over its context line instead of being cut to a few letters beside it, the step strip is one line ("Step 2 of 4 · Skills") over a thin progress bar (the labelled step list stays for assistive technology), Close is a 44px target, and Back is an icon so the footer keeps to one row. The scroll clearance that keeps a focused field clear of the docked footer now follows the footer's measured height, so a footer that wraps no longer covers the field. The frame's padding changes at the shared two-column tier (768px) instead of a 720px breakpoint of its own. New `useWizardFrameAside(width, active)`: a side panel fixed to the right edge reserves its width on the frame, so the step and its Continue stay beside it, and learns whether the frame is wide enough to dock it at all.
