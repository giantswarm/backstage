---
'@giantswarm/backstage-plugin-ui-react': patch
---

`RouteTabs` scrolls sideways wherever its tabs don't fit, not only at phone width, so a narrow window beside the shell's rail no longer cuts off the last tabs. With a mouse, a button over each edge with tabs beyond it scrolls the strip. The selected tab is scrolled into view when the selection changes, when the strip starts to overflow and when the tabs' measured width changes, and never undoes a scroll the person made by hand.

`WizardFrame` keeps its title the room it needs beside the steps (at most 320px). Where the title and the space on the other side can't both keep it, the steps move to a row of their own, centred, instead of squeezing the title.

`ShellPage` keeps its header actions within the header's width, so a select holding a long value truncates it instead of widening the page past a phone's screen.
