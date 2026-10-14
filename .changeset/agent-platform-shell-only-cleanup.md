---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-muster': minor
---

`page:agent-platform` is enabled by default. Its `if: AGENT_SHELL_ON` already
mounts it only where the agent shell is on, so `app.portals.agentPlatform`
alone switches the Agent Platform on; `page:agent-platform: false` in
`app.extensions` still turns it off. Classic-only deployments are unchanged.

The classic-chrome variants the shell-only Agent Platform left unreachable are
removed:

- **agent-platform:** the classic Agents and Model configs lists, the
  classic agent page's header, Tools/Skills tabs and cards, the session
  switcher rail, the classic sessions table and its chips, the
  `installation-scope` header action (`InstallationScopeHeaderControl`) and
  `ShellAwareContent`. The internal `useAgentShell` hook is gone;
  `AGENT_SHELL_FLAG` is still exported.
- **muster:** the classic MCP servers list, server page, workflow list and
  detail pages, the four-step registration wizard and the classic tool page
  body. **Removed export:** `useAgentShell`, which was always true wherever
  muster renders; read `isAgentShellOn` from
  `@giantswarm/backstage-plugin-agent-platform-common` instead.
