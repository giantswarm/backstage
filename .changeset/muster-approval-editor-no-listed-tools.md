---
'@giantswarm/backstage-plugin-muster': patch
---

The connector's tool settings (Test & Tools step, Change tool settings) stay available when muster lists none of its tools: after every tool is blocked, or with a Block rule alone, the stored entries and the rule for new tools can still be changed, and the list says why no tool is listed. With no row to write, Done saves a changed rule alone.
