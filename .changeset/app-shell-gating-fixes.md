---
'app': patch
---

Toggling the Agent Platform opt-in in the settings now takes effect after a reload instead of mixing the shell and classic chrome. With both portals on, the classic logo leads to `app.rootRedirect` when it names a classic page and otherwise opens the Agent Platform in a new tab. Crossing between classic pages and the shell no longer paints a frame in the previous theme.
