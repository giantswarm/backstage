# @giantswarm/backstage-plugin-ai-chat

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
