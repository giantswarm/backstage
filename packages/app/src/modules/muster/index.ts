import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { MusterApiOverride } from './MusterApiOverride';

export const musterPluginOverrides = createFrontendModule({
  pluginId: 'muster',
  extensions: [MusterApiOverride],
});
