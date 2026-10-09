---
'@giantswarm/backstage-plugin-agent-platform': minor
---

`NewSessionComposer` takes opt-in props, all off by default so the new-session
dialog and the inline composer are unchanged: `showUnavailable` lists non-ready
agents as disabled options that give the reason, `groupByNamespace` heads the
options by namespace with `recentAgentIds` listed first under "Recent",
`searchable` always offers the search box, `initialPrompt` fills the field,
`pickerPlaceholder` names the empty choice, `pickerFooterAction` lists an
action last in the picker, set apart and kept open beside a sole agent, and `promptPlaceholder`, `renderPickerAccessory`,
`renderFooter` and `onSelectedAgentChange` let a caller build around the
choice. Grouped by namespace, the picker lists a search's matches as one group
and starts the next opening with an empty search. `StartNewSession`
passes them through `composerProps`, and takes `titleMaxLength`, which
`useCreateSession` and `deriveSessionTitle` now accept as the derived title's
bound.
