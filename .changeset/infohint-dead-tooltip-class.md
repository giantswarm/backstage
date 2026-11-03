---
'@giantswarm/backstage-plugin-ui-react': patch
---

`InfoHint` no longer passes a class to its bui `Tooltip`, which drops it: the
class's 280px width and kept line breaks never applied. Nothing changes on
screen; the tooltip keeps bui's own width.
