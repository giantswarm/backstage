# @giantswarm/backstage-plugin-ai-chat

## 0.11.4

### Patch Changes

- 66c54f9: Add optional `aiChat.welcome.{title,subtitle,suggestions}` config to customize the AI chat welcome screen. Falls back to the built-in defaults when not set.
- 0af418e: Redesign AI chat layout with PluginHeader, sticky composer, scroll-on-send behavior, and polished UI styling. Decouple sidebar item from page extension toggle and add title link to drawer header.
- Updated dependencies [0af418e]
  - @giantswarm/backstage-plugin-ai-chat-react@0.4.2

## 0.11.3

### Patch Changes

- e7f7b27: Don't scroll to bottom when a new AI run starts if the user has scrolled up to read previous content.
- e7f7b27: Add streaming text-reveal animation for assistant messages with skip rules for tables and links, and fadeInUp animations for user messages.

## 0.11.2

### Patch Changes

- 90343c4: Move ai-chat-verbose-debugging feature flag from app overrides module to the ai-chat plugin.
- Updated dependencies [9d911b1]
  - @giantswarm/backstage-plugin-ui-react@0.8.3

## 0.11.1

### Patch Changes

- c06f5bf: Push right-anchored MUI drawers when the AI chat drawer opens in persistent mode, preventing overlap with other drawers like Flux resource details.
- c06f5bf: Replace AI chat floating action button with a sidebar nav item that toggles the chat drawer.
- Updated dependencies [c06f5bf]
- Updated dependencies [c06f5bf]
- Updated dependencies [c06f5bf]
  - @giantswarm/backstage-plugin-ai-chat-react@0.4.1
  - @giantswarm/backstage-plugin-ui-react@0.8.2

## 0.11.0

### Minor Changes

- 35dc69b: Improvements on the getContextUsage tool in AI chat, adding cost estimate, changing token calculation

### Patch Changes

- b3e9dd7: Reject attachments in AI chat

## 0.10.1

### Patch Changes

- 7ff0594: Fix AI chat FAB: use more specific CSS selector for bottom padding and only display when user is authenticated.
- f2047ff: Fix inline code and code block styling in markdown rendering.
- a119027: Add context window sizes for opus and sonnet 4.6 models
- Updated dependencies [843fedf]
  - @giantswarm/backstage-plugin-ui-react@0.8.1

## 0.10.0

### Minor Changes

- d7cd901: Add AI chat drawer with persistent/overlay variants, FAB, and openMode prop.
  - New `aiChatDrawerApiRef` and `AIChatDrawerApi` for controlling the drawer from anywhere in the app
  - `AIChatButton` gains an `openMode` prop (`'drawer' | 'navigate'`); defaults to drawer when the API is available
  - `AiChatDrawer` component with responsive persistent (desktop) and overlay (mobile) variants
  - `AiChatFab` floating action button component registered as an app-root-element
  - Shared `useChatSetup` hook extracted from the chat page for reuse in the drawer

### Patch Changes

- Updated dependencies [d7cd901]
  - @giantswarm/backstage-plugin-ai-chat-react@0.4.0

## 0.9.1

### Patch Changes

- 55f532b: Improve logging in ai-chat. Add conversation ID, better differentiation of log levels.

## 0.9.0

### Minor Changes

- 915083b: Replace GSFeatureEnabled with NFS config-based extension toggling. Page and nav-item blueprints are now disabled by default and enabled via `app.extensions` in app-config.yaml. Delete FeatureEnabled and MainMenu components from gs plugin.
- ebd466f: Update Backstage dependencies from 1.47.3 to 1.48.2.

### Patch Changes

- cb36dac: Fix config visibility annotations to prevent sensitive backend configuration from being exposed to the frontend.
- Updated dependencies [ebd466f]
  - @giantswarm/backstage-plugin-ai-chat-react@0.3.0
  - @giantswarm/backstage-plugin-ui-react@0.8.0

## 0.8.0

### Minor Changes

- 5850ce3: Add tool to display context window usage

### Patch Changes

- cd72c54: Make AIChatButton conditionally visible based on ai-chat plugin availability using NFS Utility API and route ref.
- Updated dependencies [cd72c54]
  - @giantswarm/backstage-plugin-ai-chat-react@0.2.1

## 0.7.0

### Minor Changes

- d3fd8a5: Add Inspect/Troubleshoot with AI button

### Patch Changes

- 24c279b: Improve link rendering in AI chat
- bb1a3a4: Syntax highlighting for verbose tool call details
- Updated dependencies [24c279b]
- Updated dependencies [d3fd8a5]
  - @giantswarm/backstage-plugin-ui-react@0.7.3
  - @giantswarm/backstage-plugin-ai-chat-react@0.2.0

## 0.6.0

### Minor Changes

- f09f501: Migrate ai-chat plugin to New Frontend System

## 0.5.1

### Patch Changes

- 77e6969: Fix markdown styling in AI chat: add display inline-block to inline code elements and vertical spacing to list items

## 0.5.0

### Minor Changes

- a68a2b2: Add OAuth2 PKCE authentication support for MCP servers
  - Add custom OAuth2 authenticator with PKCE (Proof Key for Code Exchange) support for secure public client authentication
  - Add CIMD (Client ID Metadata Document) router to serve OAuth client metadata for MCP server authorization flows
  - Register MCP auth providers (prefixed with `mcp-`) in the backend auth module
  - Add `MCPAuthProviders` API in ai-chat plugin to fetch credentials for configured MCP auth providers
  - Update AI Chat page to automatically inject MCP auth tokens into request headers
  - Refactor `GSAuthProviders` to separate Kubernetes and MCP auth providers with dedicated methods

### Patch Changes

- a68a2b2: Add authentication provider support and multi-installation features for MCP servers
  - Add `authProvider` configuration option to inject authentication tokens from request headers into MCP server requests
  - Add `installation` option to prefix tool names and descriptions for multi-installation setups
  - Add MCP resources loading and expose them as callable tools
  - Add `deduplicateToolCallIds` utility to fix Anthropic API errors with duplicate tool call IDs
  - Add TypeScript config schema for AI chat configuration

## 0.4.0

### Minor Changes

- 13198eb: Show suggestions to start with in AI chat

### Patch Changes

- 31207f3: Add feature flag ai-chat-verbose-debugging to toggle reasoning and tool usage info
- ccaf194: Reduce list indentation in chat responses

## 0.3.0

### Minor Changes

- 0384d69: Update ai-sdk packages to v6
- 98f9ffb: Add components to render tools calling in the AI chat.
- 98f9ffb: Add components to display reasoning in the AI chat.

## 0.2.3

### Patch Changes

- feb7eb2: Support initializing a chat from a URL parameter

## 0.2.2

### Patch Changes

- 027a200: Fix React dependency.

## 0.2.1

### Patch Changes

- e1816f4: Fix React dependency.

## 0.2.0

### Minor Changes

- 1a75706: Add AI Chat plugin.
