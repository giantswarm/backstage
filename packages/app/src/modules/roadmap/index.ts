import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { RoadmapApiOverride } from './RoadmapApiOverride';

export const roadmapPluginOverrides = createFrontendModule({
  pluginId: 'roadmap',
  extensions: [RoadmapApiOverride],
});
