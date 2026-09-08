---
'@giantswarm/backstage-plugin-muster-backend': minor
---

`GET /tools/filter` passes a repeated `toolset=` query parameter through to muster's `filter_tools` as the `toolset` selector list, and `include_presets` as a boolean. muster owns the grammar: an unknown preset or a malformed selector comes back as muster's own error message.
