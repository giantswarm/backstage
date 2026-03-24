import { createFrontendModule } from '@backstage/frontend-plugin-api';
import {
  KubernetesAuthProvidersOverride,
  KubernetesClientOverride,
} from './KubernetesApiOverrides';

export const kubernetesPluginOverrides = createFrontendModule({
  pluginId: 'kubernetes',
  extensions: [KubernetesAuthProvidersOverride, KubernetesClientOverride],
});
