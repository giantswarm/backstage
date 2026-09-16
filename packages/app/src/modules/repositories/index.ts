import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { RepositoriesApiOverride } from './RepositoriesApiOverride';

export const repositoriesPluginOverrides = createFrontendModule({
  pluginId: 'repositories',
  extensions: [RepositoriesApiOverride],
});
