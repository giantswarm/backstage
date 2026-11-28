---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The inline approval card shows the tool's arguments as one "Input:" block: muster's canonical arguments, pretty-printed, nested objects and arrays included, with every character kept (a string's `\n` stays visible and breaks the line, muster's marking of invisible characters is kept). Without arguments it says "Input: none"; a long block is collapsed behind "Show all N characters", never cut.
