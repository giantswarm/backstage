---
'@giantswarm/backstage-plugin-ai-chat': patch
---

Fix AI chat input freezing after typing dead keys (e.g., backtick on German keyboard) by replacing the upstream `ComposerPrimitive.Input` with a controlled `TextField` bound directly to the assistant runtime.
