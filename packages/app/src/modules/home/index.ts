import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { AgentShellHomePage } from './AgentShellHomePage';
import { HomePageOverride } from './HomePageOverride';

export const homePluginOverrides = createFrontendModule({
  pluginId: 'home',
  extensions: [HomePageOverride, AgentShellHomePage],
});
