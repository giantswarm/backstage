import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { ScaffolderPageOverride } from './ScaffolderPageOverride';
import { ScaffolderApiOverride } from './ScaffolderApiOverride';

export const scaffolderPluginOverrides = createFrontendModule({
  pluginId: 'scaffolder',
  extensions: [ScaffolderPageOverride, ScaffolderApiOverride],
});
