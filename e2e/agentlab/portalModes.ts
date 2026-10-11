/**
 * Which specs prove which portal (see `PortalMode` in `lab.ts`).
 *
 * The Agent Platform lives in the agent shell only: a lab in `classic` mode
 * routes none of its pages, and in `shell` mode `/agent-platform/**` always
 * renders the shell. So every spec of the Agent Platform — its sessions,
 * agents, models and serving, connectors (muster) and workflows, usage — runs
 * in the `agentlab-shell` project, against a lab in `shell` mode; every other
 * spec (the classic portal's Giant Swarm pages, sign-in, the classic sidebar)
 * runs in the `agentlab` project, in either mode.
 *
 * A list rather than a directory, so the specs keep their place (and their
 * history); a new spec of the Agent Platform joins it.
 */
export const SHELL_SPECS = [
  'agent-avatars.spec.ts',
  'agent-edit-commit.spec.ts',
  'agent-lifecycle.spec.ts',
  'agent-platform-navigation.spec.ts',
  'agents.spec.ts',
  'definition-editor.spec.ts',
  'gpu-node-pool.spec.ts',
  'inventory-gate.spec.ts',
  'kagent-denial-reason.spec.ts',
  'mcp-server-auth-modes.spec.ts',
  'mcp-servers.spec.ts',
  'model-backends.spec.ts',
  'models.spec.ts',
  'serve-node-choice.spec.ts',
  'serve-through-model-manager.spec.ts',
  'served-model-api.spec.ts',
  'served-model-timeline.spec.ts',
  'serving-feedback.spec.ts',
  'serving-llminferenceservice.spec.ts',
  'serving-order.spec.ts',
  'serving-state.spec.ts',
  'session-runtime-lost.spec.ts',
  'session-state-column.spec.ts',
  'sessions-awaiting-data.spec.ts',
  'sessions-unreadable-reason.spec.ts',
  'telemetry.spec.ts',
  'usage-cost.spec.ts',
  'workflows.spec.ts',
] as const;

/** {@link SHELL_SPECS} as the globs Playwright's `testMatch`/`testIgnore` take. */
export const shellSpecGlobs = SHELL_SPECS.map(spec => `**/${spec}`);
