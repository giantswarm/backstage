import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { GeneralPage } from './GeneralPage';
import { ProviderSettings } from './ProviderSettings';

export const userSettingsPluginOverrides = createFrontendModule({
  pluginId: 'user-settings',
  extensions: [GeneralPage, ProviderSettings],
});
