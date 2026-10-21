/**
 * Which specs prove which portal (see `PortalMode` in `lab.ts`).
 *
 * The Agent Platform lives in the agent shell only: a lab in `classic` mode
 * routes none of its pages, and in `shell` mode its routes (`/`, `/sessions`,
 * `/usage`, `/profile`, `/customize/**`, and the old `/agent-platform/**`,
 * which only redirects) always render the shell. So every spec of the Agent Platform — its sessions,
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
  'agent-change-harness.spec.ts',
  'agent-edit-commit.spec.ts',
  'agent-egress-tls.spec.ts',
  'agent-lifecycle.spec.ts',
  'agent-platform-navigation.spec.ts',
  'agents-list-states.spec.ts',
  'agents-redirect.spec.ts',
  'agents.spec.ts',
  'connector-display-name.spec.ts',
  'definition-editor.spec.ts',
  'first-agent.spec.ts',
  'form-validation.spec.ts',
  'gpu-node-pool.spec.ts',
  'harness-codex-card.spec.ts',
  'harness-codex-turn.spec.ts',
  'harness-omp-turn.spec.ts',
  'harness-no-limits.spec.ts',
  'inventory-gate.spec.ts',
  'kagent-denial-reason.spec.ts',
  'legacy-addresses.spec.ts',
  'markdown-footnotes.spec.ts',
  'mcp-server-auth-modes.spec.ts',
  'mcp-servers.spec.ts',
  'mcp-sign-in-row.spec.ts',
  'notification-inbox.spec.ts',
  'provider-connect.spec.ts',
  'muster-namespaced.spec.ts',
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
  'session-expiry.spec.ts',
  'session-images.spec.ts',
  'session-runtime-lost.spec.ts',
  'session-state-column.spec.ts',
  'sessions-awaiting-data.spec.ts',
  'sessions-unreadable-reason.spec.ts',
  'shell-sign-in.spec.ts',
  'telemetry.spec.ts',
  'tenants.spec.ts',
  'usage-cost.spec.ts',
  'wizard-tools-layout.spec.ts',
  'workflows.spec.ts',
] as const;

/**
 * The phone's specs (mobile overhaul wave 4, `mobile-overhaul-plan.md` §4):
 * the Agent Platform at 375×812 with touch, in the `agentlab-mobile` project
 * only — the bottom bar's navigation, the scrolling tab strips, sessions, one
 * wizard pass, a workflow's step list, a tool's page, the hosting rows' ⋯ menus, and no
 * sideways page scroll on the pages a person reads on a phone. Like
 * {@link SHELL_SPECS}, they need a lab in `shell` mode.
 */
export const MOBILE_SPECS = [
  'mobile-hosting.spec.ts',
  'mobile-navigation.spec.ts',
  'mobile-notification-inbox.spec.ts',
  'mobile-sessions.spec.ts',
  'mobile-tool-page.spec.ts',
  'mobile-wizard.spec.ts',
  'mobile-workflow.spec.ts',
] as const;

const globs = (specs: readonly string[]) => specs.map(spec => `**/${spec}`);

/** {@link SHELL_SPECS} as the globs Playwright's `testMatch`/`testIgnore` take. */
export const shellSpecGlobs = globs(SHELL_SPECS);

/** {@link MOBILE_SPECS} as globs. */
export const mobileSpecGlobs = globs(MOBILE_SPECS);
