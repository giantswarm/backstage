import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { agentShellLayout } from './layoutExtension';
import { agentShellThemeRoot } from './themeRootExtension';
import { agentShellCustomizePage } from './customizePageExtension';
import { AGENT_SHELL_FLAG } from './predicates';

export { AGENT_SHELL_FLAG, agentShellOff, agentShellOn } from './predicates';
export {
  isAgentArea,
  useAgentShellArea,
  useAgentShellAvailable,
} from './agentArea';

export const agentShellModule = createFrontendModule({
  pluginId: 'app',
  featureFlags: [
    {
      name: AGENT_SHELL_FLAG,
      description:
        'Agent Platform shell on its own routes, next to the classic portal (takes effect after a reload)',
    },
  ],
  extensions: [agentShellLayout, agentShellThemeRoot, agentShellCustomizePage],
});
