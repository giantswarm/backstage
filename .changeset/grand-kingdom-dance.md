---
'@giantswarm/backstage-plugin-ai-chat': patch
---

Generate the conversation id eagerly so the new conversation appears in the history list immediately on the first user message, instead of after the first assistant token arrives.
