---
'app': patch
---

The fade above "Show all instructions" on an agent's Overview now blends into the page instead of drawing a grey band. bui's `--bui-bg-inherit` is resolved again wherever a theme is applied, so outside a card it follows the theme's app background (white in the agent shell, bui's dark background in a dark theme) instead of bui's light default.
