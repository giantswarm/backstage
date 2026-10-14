import { AppRootElementBlueprint } from '@backstage/frontend-plugin-api';
import { AgentShellThemeRoot } from './AgentShellThemeRoot';

/**
 * Always mounted; the component itself marks the document only on the agent
 * area's routes while the shell is available, so the shell's CSS overrides
 * never leak into classic pages.
 */
export const agentShellThemeRoot = AppRootElementBlueprint.make({
  name: 'agent-shell-theme',
  params: { element: <AgentShellThemeRoot /> },
});
