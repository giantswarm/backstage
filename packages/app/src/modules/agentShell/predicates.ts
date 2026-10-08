import type { FilterPredicate } from '@backstage/filter-predicates';

export const AGENT_SHELL_FLAG = 'agent-platform-shell';

export const agentShellOn: FilterPredicate = {
  featureFlags: { $contains: AGENT_SHELL_FLAG },
};

export const agentShellOff: FilterPredicate = { $not: agentShellOn };
