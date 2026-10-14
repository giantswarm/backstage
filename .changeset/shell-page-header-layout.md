---
'@giantswarm/backstage-plugin-ui-react': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

`ShellPage` keeps its header actions at the top right beside the title: a long
title wraps beside them instead of pushing them under its badge row, so the
session page's pin and menu stay put, on a phone too. Only an action group too
wide to leave the title its room (192px, 320px with a description; an avatar or
tile comes on top) moves under it. The avatar or tile sits beside the title's
first line, as the actions do. A header row with the Environment select lines
up on its bottom edge, so the buttons beside the select align with its field
rather than its label. Usage's select and time range are items of that row,
8px apart, as every header's controls are.
