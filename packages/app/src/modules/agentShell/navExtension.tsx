import { NavContentBlueprint } from '@backstage/plugin-app-react';
import { AgentShellNav } from './AgentShellNav';
import { agentShellOn } from './predicates';

export const agentShellNav = NavContentBlueprint.make({
  name: 'agent-shell',
  if: agentShellOn,
  params: {
    component: AgentShellNav,
  },
});
