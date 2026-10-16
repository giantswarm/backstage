---
'@giantswarm/backstage-plugin-muster': patch
---

The "Reads" and "Changes things" badges on tools (and "Only reads" / "Can change things" on workflows) are easier to read: their text is set in bui's 12px badge size instead of 10px, on one line, and "Reads" now has a visible box (a light fill and edge) in light and dark theme, while "Changes things" stays the stronger, warning-coloured one. The workflow flow and its phone step list draw their step markers, the step number and "May fail" included, with the same shared badge (`MarkerBadge`, with a compact size for a box's edge) instead of a look of their own.
