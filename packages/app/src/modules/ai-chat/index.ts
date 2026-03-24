import { createFrontendModule } from '@backstage/frontend-plugin-api';
import { AiChatApiOverride } from './AiChatApiOverride';

export const aiChatPluginOverrides = createFrontendModule({
  pluginId: 'ai-chat',
  extensions: [AiChatApiOverride],
});
