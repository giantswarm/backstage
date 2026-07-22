---
'@giantswarm/backstage-plugin-muster': patch
---

Fix regressions from the muster Tool Explorer bui migration:

- Restore the result table's scroll cap (max-height with overflow) so large tabular results scroll inside the panel instead of overflowing it.
- Keep the clickable tool row's contents as phrasing content so no block-level elements nest inside the native `<button>`.
- Restore the ability to clear an optional enum argument back to unset (a leading "unset" option), so a previously chosen value can be removed from the call payload.
