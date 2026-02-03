# @giantswarm/backstage-plugin-ai-chat-backend

## 0.5.1

### Patch Changes

- 2f059dd: Modify system prompt to prevent guessing of hostnames for links in the chat

## 0.5.0

### Minor Changes

- a68a2b2: Add authentication provider support and multi-installation features for MCP servers
  - Add `authProvider` configuration option to inject authentication tokens from request headers into MCP server requests
  - Add `installation` option to prefix tool names and descriptions for multi-installation setups
  - Add MCP resources loading and expose them as callable tools
  - Add `deduplicateToolCallIds` utility to fix Anthropic API errors with duplicate tool call IDs
  - Add TypeScript config schema for AI chat configuration

## 0.4.0

### Minor Changes

- 061ff6d: Add tool getCurrentUserInfo to agent to fetch info on the current user
- b61a7b3: Add skills to agent

### Patch Changes

- b32909b: Handle MCP connection failures gracefully

## 0.3.0

### Minor Changes

- 0384d69: Update ai-sdk packages to v6
- 98f9ffb: Enable thinking for anthropic model.

### Patch Changes

- f81c921: Remove react-ai-sdk dependency.

## 0.2.3

### Patch Changes

- 24a4c48: Increase request size limit

## 0.2.2

### Patch Changes

- cba1afd: Fix dependency issue.

## 0.2.1

### Patch Changes

- 027a200: Fix React dependency.

## 0.2.0

### Minor Changes

- 1a75706: Add AI Chat plugin.
