import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { PlatformCapabilitiesApiOverride } from './PlatformCapabilitiesApiOverride';

export const platformCapabilitiesPluginOverrides = createFrontendModule({
  pluginId: 'platform-capabilities',
  extensions: [PlatformCapabilitiesApiOverride],
});
