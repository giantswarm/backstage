---
'@giantswarm/backstage-plugin-muster': minor
---

Align the muster section with the New Frontend System app shell and switch to modern BUI tabs.

- The page no longer wraps its content in the classic `<Page>`/`<Header>`. Under the NFS app shell (which already renders the plugin header and owns the document scroll), the classic `<Page>` (`height:100vh; overflow-y:auto`) added a redundant inner scrollbar and a duplicate header. Content now renders directly, leaving a single scrollbar and one header.
- Tab navigation moved from the classic `RoutedTabs` strip to `SubPageBlueprint` tabs (Dashboard, MCP servers, Workflows, Tool explorer), which render in the BUI plugin header — matching the flux section. Each tab is wrapped in shared providers so the active installation and muster session stay consistent across tabs. The Workflows tab hosts the per-workflow detail route, keeping the tab selected.

Tab URLs change: the dashboard is now `/muster/dashboard` (bare `/muster` redirects to it) and the other tabs are `/muster/{mcp-servers,workflows,tools}`.
