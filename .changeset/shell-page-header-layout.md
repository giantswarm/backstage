---
'@giantswarm/backstage-plugin-ui-react': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

`ShellPage` keeps its header actions at the top right beside the title: a long
title wraps beside them instead of pushing them under its badge row, so the
session page's pin and menu stay put, on a phone too. Only an action group too
wide to leave the title room (the Environment select with buttons) moves under
it. Header actions line up on their bottom edge, so a button beside the
Environment select aligns with its field rather than its label, and the Usage
time range sits 8px from the select, as every header's controls do.
