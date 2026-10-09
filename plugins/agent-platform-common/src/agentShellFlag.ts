/**
 * The feature flag that makes the Agent Platform the portal's main interface.
 * Lives here so every plugin that renders inside the shell can read it without
 * depending on the agent-platform frontend plugin.
 */
export const AGENT_SHELL_FLAG = 'agent-platform-shell';
