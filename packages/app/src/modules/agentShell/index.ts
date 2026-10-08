import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { agentShellLayout } from './layoutExtension';
import { agentShellNav } from './navExtension';
import { agentShellThemeRoot } from './themeRootExtension';
import { AGENT_SHELL_FLAG } from './predicates';

export { AGENT_SHELL_FLAG, agentShellOff, agentShellOn } from './predicates';

export const agentShellModule = createFrontendModule({
  pluginId: 'app',
  featureFlags: [
    {
      name: AGENT_SHELL_FLAG,
      description:
        'Agent Platform as the main portal interface (takes effect after a reload)',
    },
  ],
  extensions: [agentShellLayout, agentShellNav, agentShellThemeRoot],
});
