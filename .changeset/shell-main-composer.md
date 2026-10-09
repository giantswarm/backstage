---
'@giantswarm/backstage-plugin-agent-platform': minor
---

`NewSessionComposer` takes opt-in props, all off by default so the new-session
dialog and the inline composer are unchanged: `showUnavailable` lists non-ready
agents as disabled options that give the reason, `groupByNamespace` heads the
options by namespace with `recentAgentIds` listed first under "Recent",
`searchable` always offers the search box, `initialPrompt` fills the field, and
`promptPlaceholder`, `renderPickerAccessory`, `renderFooter` and
`onSelectedAgentChange` let a caller build around the choice. `StartNewSession`
passes them through `composerProps`, and takes `titleMaxLength`, which
`useCreateSession` and `deriveSessionTitle` now accept as the derived title's
bound.
