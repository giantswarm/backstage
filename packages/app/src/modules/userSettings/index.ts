import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { ProviderSettings } from './ProviderSettings';

export const userSettingsPluginOverrides = createFrontendModule({
  pluginId: 'user-settings',
  extensions: [ProviderSettings],
});
