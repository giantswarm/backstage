import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { PlansApiOverride } from './PlansApiOverride';

export const plansPluginOverrides = createFrontendModule({
  pluginId: 'plans',
  extensions: [PlansApiOverride],
});
