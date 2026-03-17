import { createApiRef } from '@backstage/core-plugin-api';

/** Marker interface — presence in the API holder indicates the ai-chat plugin is active. */
export interface AiChatApi {}

export const aiChatApiRef = createApiRef<AiChatApi>({
  id: 'plugin.ai-chat.service',
});

/** Handler that the drawer provider registers to receive open/close calls. */
export type AIChatDrawerHandler = {
  openDrawer(message?: string): void;
  closeDrawer(): void;
};

/** API for controlling the AI chat drawer from anywhere in the app. */
export interface AIChatDrawerApi {
  openDrawer(message?: string): void;
  closeDrawer(): void;
  /** Register the drawer implementation. Returns an unregister function. */
  registerHandler(handler: AIChatDrawerHandler): () => void;
}

export const aiChatDrawerApiRef = createApiRef<AIChatDrawerApi>({
  id: 'plugin.ai-chat.drawer',
});
