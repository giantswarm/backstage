import { createApiRef } from '@backstage/core-plugin-api';

/** Marker interface — presence in the API holder indicates the ai-chat plugin is active. */
export interface AiChatApi {}

export const aiChatApiRef = createApiRef<AiChatApi>({
  id: 'plugin.ai-chat.service',
});
