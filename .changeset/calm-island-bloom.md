---
'@giantswarm/backstage-plugin-ai-chat-react': minor
'@giantswarm/backstage-plugin-ai-chat': minor
---

Add AI chat drawer with persistent/overlay variants, FAB, and openMode prop.

- New `aiChatDrawerApiRef` and `AIChatDrawerApi` for controlling the drawer from anywhere in the app
- `AIChatButton` gains an `openMode` prop (`'drawer' | 'navigate'`); defaults to drawer when the API is available
- `AiChatDrawer` component with responsive persistent (desktop) and overlay (mobile) variants
- `AiChatFab` floating action button component registered as an app-root-element
- Shared `useChatSetup` hook extracted from the chat page for reuse in the drawer
