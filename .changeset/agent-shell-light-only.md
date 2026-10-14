---
'app': patch
---

The Agent Platform shell is light-only: on agent-area routes (where `data-agent-shell` is set) the app now renders the light theme regardless of the user's dark theme preference — the MUI theme is built from the light agent-shell palette and the body's `data-theme-mode` follows it, so bui renders light too. Classic routes keep honoring the user's theme choice.
