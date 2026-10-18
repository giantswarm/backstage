---
'@giantswarm/backstage-plugin-ui-react': minor
---

`ui-react` adds `BusyDialog`, a controlled bui `Dialog` that stays open while `isBusy`: Escape, a click outside, the header's close button and the `close` it hands its children (for a footer's Cancel) do nothing until the request settles. `ConfirmDialog` is built on it, and every busy dialog in the agent-platform, muster, platform-capabilities and repositories plugins uses it, so no dialog can leave a close path ungated. The `dialogDismissLock` spread it replaces is no longer exported.
