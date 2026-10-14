---
'app': patch
---

The agent-platform shell's tab strips no longer wrap to a second row or
shrink Customize's labels at phone width: the strip scrolls sideways (from
ui-react's `RouteTabs`), so the shell stylesheet drops its five-tab squeeze.
