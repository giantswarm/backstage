---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-platform-capabilities': patch
'@giantswarm/backstage-plugin-repositories': patch
---

The Load, Pull and Import model dialogs can no longer be closed by their header's close button while their request is on its way; Escape and an outside click already could not. Every dialog that holds itself open during a request now does so through ui-react's `dialogDismissLock`.
