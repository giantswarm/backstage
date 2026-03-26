import { createFrontendModule } from '@backstage/frontend-plugin-api';
import {
  listClusterPickerOverride,
  treeClusterPickerOverride,
} from './overrides';

export const fluxPluginOverrides = createFrontendModule({
  pluginId: 'flux',
  extensions: [listClusterPickerOverride, treeClusterPickerOverride],
});
