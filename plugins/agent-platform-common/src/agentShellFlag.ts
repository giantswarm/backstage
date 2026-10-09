/**
 * The feature flag that makes the Agent Platform shell available. It gates
 * availability only: with the flag on, the shell renders on the agent area's
 * routes (`/`, `/agent-platform/**`, `/customize/**`) while every other route
 * keeps the classic portal chrome; with it off, the app is classic everywhere.
 * Lives here so every plugin that renders inside the shell can read it without
 * depending on the agent-platform frontend plugin.
 */
export const AGENT_SHELL_FLAG = 'agent-platform-shell';
