---
'@giantswarm/backstage-plugin-gs': patch
---

The HTTP routes card's certificate cell no longer passes a class to its bui
`Tooltip`, which drops it: the class's 600px width never applied. Nothing
changes on screen; the tooltip keeps bui's own width.
