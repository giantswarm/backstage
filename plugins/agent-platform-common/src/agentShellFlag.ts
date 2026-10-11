/**
 * The feature flag that reads "the Agent Platform shell is available". It
 * gates availability only: while it reads as active, the shell renders on the
 * agent area's routes (`/`, `/agent-platform/**`, `/customize/**`) while every
 * other route keeps the classic portal chrome; while it does not, the app is
 * classic everywhere.
 *
 * The deployment decides (`app.portals.agentPlatform`, see `readPortals`):
 * the app's FeatureFlagsApi reports the flag as active whenever the
 * deployment has the Agent Platform on. Set by a person, the flag is only an
 * opt-in for one browser while the deployment has it off.
 *
 * Lives here so every plugin that renders inside the shell can read it without
 * depending on the agent-platform frontend plugin.
 */
export const AGENT_SHELL_FLAG = 'agent-platform-shell';

/**
 * The extension predicate (an extension's `if`) for "the Agent Platform shell
 * is available": the {@link AGENT_SHELL_FLAG} reads as active. Extension
 * predicates can only read feature flags, which is why the deployment's choice
 * reaches them through this flag. Evaluated once, at app start.
 *
 * Every page of the Agent Platform carries it: the Agent Platform lives in the
 * shell only, so a deployment without it routes none of its pages and the
 * classic portal shows nothing of it.
 *
 * A plain object in `@backstage/filter-predicates`' `FilterPredicate` shape,
 * so this package needs no frontend dependency.
 */
export const AGENT_SHELL_ON = {
  featureFlags: { $contains: AGENT_SHELL_FLAG },
};
