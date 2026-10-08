import { AppRootElementBlueprint } from '@backstage/frontend-plugin-api';
import { AgentShellThemeRoot } from './AgentShellThemeRoot';
import { agentShellOn } from './predicates';

export const agentShellThemeRoot = AppRootElementBlueprint.make({
  name: 'agent-shell-theme',
  if: agentShellOn,
  params: { element: <AgentShellThemeRoot /> },
});
