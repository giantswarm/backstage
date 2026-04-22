---
'app': patch
---

Fix React "Each child in a list should have a unique key prop" warning
emitted on the root page by adding a `key` to the scaffolder "Create..."
`SidebarItem` in the main sidebar.
