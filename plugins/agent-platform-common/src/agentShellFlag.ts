/**
 * The feature flag that reads "the Agent Platform shell is available". It
 * gates availability only: while it reads as active, the shell renders on the
 * agent area's routes (`/`, `/sessions/**`, `/usage/**`, `/profile`,
 * `/customize/**`, and the old `/agent-platform/**`, which only redirects)
 * while every other route keeps the classic portal chrome; while it does not, the app is
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

const latched = new WeakMap<object, boolean>();

/**
 * Whether the Agent Platform shell is available, as this app load decided it:
 * the {@link AGENT_SHELL_FLAG}'s value at the first read, latched per
 * FeatureFlagsApi instance (one per app load).
 *
 * Every render-time read of the flag goes through here, because the extension
 * predicates ({@link AGENT_SHELL_ON}) are evaluated once, at app start, and the
 * chrome must keep agreeing with the pages they routed. Toggling the opt-in on
 * the settings page saves it for the next load and does not mix the shells in
 * this one. The settings page itself keeps reading the live value.
 */
export function isAgentShellOn(featureFlags: {
  isActive(name: string): boolean;
}): boolean {
  let on = latched.get(featureFlags);
  if (on === undefined) {
    on = featureFlags.isActive(AGENT_SHELL_FLAG);
    latched.set(featureFlags, on);
  }
  return on;
}
