import type { FilterPredicate } from '@backstage/filter-predicates';
import { AGENT_SHELL_FLAG } from '@giantswarm/backstage-plugin-agent-platform';

export { AGENT_SHELL_FLAG };

export const agentShellOn: FilterPredicate = {
  featureFlags: { $contains: AGENT_SHELL_FLAG },
};

export const agentShellOff: FilterPredicate = { $not: agentShellOn };
