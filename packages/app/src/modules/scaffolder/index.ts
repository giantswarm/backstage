import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { ScaffolderTemplatesSubPageOverride } from './ScaffolderTemplatesSubPageOverride';
import { ScaffolderApiOverride } from './ScaffolderApiOverride';

export const scaffolderPluginOverrides = createFrontendModule({
  pluginId: 'scaffolder',
  extensions: [ScaffolderTemplatesSubPageOverride, ScaffolderApiOverride],
});
