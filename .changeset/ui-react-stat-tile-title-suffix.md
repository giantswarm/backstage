---
'@giantswarm/backstage-plugin-ui-react': minor
---

- **`Stat`** takes `variant="tile"` for a headline figure in its own outlined
  card, with `beside` (e.g. a `StatDelta`) on the value's baseline and a `sub`
  line under it. `StatGrid` lays tiles out four across, two on a phone. The
  default `inline` look is unchanged.
- **`ShellDocumentTitleProvider`** names the suffix shell document titles end
  with; ui-react no longer hard-codes "Agent Platform". Without a provider a
  title has no suffix.
- **`testUtils` entry point**: the `matchMedia` test helpers
  (`mockPhoneLayout`, `mockDesktopLayout`, `mockViewport`, …) moved from the
  main entry to `@giantswarm/backstage-plugin-ui-react/testUtils`, so they no
  longer ship with the runtime code.
