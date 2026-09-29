---
'@giantswarm/backstage-plugin-platform-capabilities': patch
'@giantswarm/backstage-plugin-ui-react': patch
---

Capabilities tab: the card is built from the portal's components. The state is a `StatusLabel` with the glyph the Installations page's cell shows for the same capability and the legend's gloss on its tooltip; the card is a bui `Card` with two labelled regions, _On record_ -- a definition list of the choices with what each is about under its value, the choices the record lacks marked in place -- and _Compared with the definition_; every file group and skipped-check note is an accordion, closed until opened; the diff's tints and every colour come from bui's tokens, so the card themes with the app. ui-react: `StatusLabel` lays out inline on request, `SectionHeader` takes an `id` for a region it names, `SyncMarkLabel` shows a mark with its words.
