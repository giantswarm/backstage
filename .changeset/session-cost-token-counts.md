---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': patch
---

The line under _Est. cost_, in a session's cost popover and on _Usage_, now names the input and output tokens the estimate priced, written the way the token figures beside it are (`48.0k input and 466 output tokens`), instead of one exact total that no figure on the page showed. When kagent counted tokens beyond input and output, such as thinking, the line says how many the estimate does not price. Token figures round half up to a tenth (48,050 reads `48.1k`), move to the next unit when they round into it (999,950 reads `1.0M`, not `1000.0k`), and reach billions (`2.3B`). Sizes do the same (1,048,575 bytes reads `1.0 MiB`, not `1024 KiB`).
