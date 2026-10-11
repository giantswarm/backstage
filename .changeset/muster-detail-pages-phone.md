---
'@giantswarm/backstage-plugin-muster': patch
---

Workflow, connector and tool pages read on a phone.

- **Workflow steps:** at phone width the flow canvas becomes a step list read with the page. Before, a parallel group or the cleanup lane made the flow wider than the screen, so the lane was a sliver at its edge, and the capped scroll box trapped the swipe that should scroll the page. Each step is a card that opens its details in place under it. A forEach or parallel step lists its steps indented under it, a condition is an "Only if …" line on the step, and cleanup has its own "If a step fails" section. Long workflows show 20 steps at a time. Wider screens keep the canvas.
- **Workflow inputs and runs:** a long input default (JSON, a URL) now wraps instead of being cut off. An opened run says when it started to the minute; that was a hover title only.
- **Tool page:** in the shell it uses the platform's page frame (phone gutters, a wrapping title, the trail under Customize). A tool's full name breaks instead of widening the page, and the result box stops above the phone's bottom bar.
- **Tool result "Table" view:** columns keep a least width, so a wide result scrolls sideways inside its table instead of being squeezed to slivers.
- **Connector page:** long tool names wrap in the Tools tab. A disabled Edit now says why on a tap, not only on hover or focus.
