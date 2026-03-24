import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { ScaffolderPageOverride } from './ScaffolderPageOverride';

export const scaffolderPluginOverrides = createFrontendModule({
  pluginId: 'scaffolder',
  extensions: [ScaffolderPageOverride],
});
