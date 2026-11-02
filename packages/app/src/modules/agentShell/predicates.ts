import type { FilterPredicate } from '@backstage/filter-predicates';
import {
  AGENT_SHELL_FLAG,
  AGENT_SHELL_ON,
} from '@giantswarm/backstage-plugin-agent-platform-common';

export { AGENT_SHELL_FLAG };

/**
 * The extension predicates for "the Agent Platform shell is available" and its
 * negation. Extension predicates can only read feature flags, so they read the
 * `agent-platform-shell` flag — which the app's FeatureFlagsApi
 * (`PortalFeatureFlags`) reports from the deployment's `app.portals` config,
 * with the person's own flag as the opt-in while the deployment has the Agent
 * Platform off. Evaluated once, at app start. The same predicate the Agent
 * Platform's own pages carry (`AGENT_SHELL_ON`).
 */
export const agentShellOn: FilterPredicate = AGENT_SHELL_ON;

export const agentShellOff: FilterPredicate = { $not: agentShellOn };
