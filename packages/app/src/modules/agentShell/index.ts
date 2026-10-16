import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { agentShellLayout } from './layoutExtension';
import { agentShellThemeRoot } from './themeRootExtension';
import { agentShellCustomizePage } from './customizePageExtension';
import { agentShellFeatureFlagsApi } from './featureFlagsApiExtension';
import { AGENT_SHELL_FLAG } from './predicates';

export { AGENT_SHELL_FLAG, agentShellOff, agentShellOn } from './predicates';
export { agentPlatformLegacyPages } from './legacyPagesModule';
export {
  isAgentArea,
  useAgentShellArea,
  useAgentShellAvailable,
  usePortals,
} from './agentArea';

export const agentShellModule = createFrontendModule({
  pluginId: 'app',
  featureFlags: [
    {
      name: AGENT_SHELL_FLAG,
      description:
        'Opt in to the Agent Platform shell on its own routes, next to the classic portal, while this deployment has it switched off (takes effect after a reload)',
    },
  ],
  extensions: [
    agentShellFeatureFlagsApi,
    agentShellLayout,
    agentShellThemeRoot,
    agentShellCustomizePage,
  ],
});
