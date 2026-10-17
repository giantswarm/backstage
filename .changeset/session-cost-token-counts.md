---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The line under _Est. cost_, in a session's cost popover and on _Usage_, now names the input and output tokens the estimate priced, written the way the token figures beside it are (`48.0k input and 466 output tokens`), instead of one exact total that no figure on the page showed. Token figures round half up to a tenth (48,050 reads `48.1k`) and move to the next unit when they round into it (999,950 reads `1.0M`, not `1000.0k`).
