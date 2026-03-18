# @giantswarm/backstage-plugin-ai-chat-react

## 0.4.0

### Minor Changes

- d7cd901: Add AI chat drawer with persistent/overlay variants, FAB, and openMode prop.
  - New `aiChatDrawerApiRef` and `AIChatDrawerApi` for controlling the drawer from anywhere in the app
  - `AIChatButton` gains an `openMode` prop (`'drawer' | 'navigate'`); defaults to drawer when the API is available
  - `AiChatDrawer` component with responsive persistent (desktop) and overlay (mobile) variants
  - `AiChatFab` floating action button component registered as an app-root-element
  - Shared `useChatSetup` hook extracted from the chat page for reuse in the drawer

## 0.3.0

### Minor Changes

- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.

## 0.2.1

### Patch Changes

- cd72c54: Make AIChatButton conditionally visible based on ai-chat plugin availability using NFS Utility API and route ref.

## 0.2.0

### Minor Changes

- d3fd8a5: Add Inspect/Troubleshoot with AI button
