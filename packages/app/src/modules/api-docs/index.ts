import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { ApiDocsConfigOverride } from './ApiDocsConfigOverride';

export const apiDocsPluginOverrides = createFrontendModule({
  pluginId: 'api-docs',
  extensions: [ApiDocsConfigOverride],
});
