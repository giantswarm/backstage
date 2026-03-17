import type {
  AIChatDrawerApi,
  AIChatDrawerHandler,
} from '@giantswarm/backstage-plugin-ai-chat-react';

export class AIChatDrawer implements AIChatDrawerApi {
  private handler: AIChatDrawerHandler | null = null;

  registerHandler(handler: AIChatDrawerHandler): () => void {
    this.handler = handler;
    return () => {
      if (this.handler === handler) {
        this.handler = null;
      }
    };
  }

  openDrawer(message?: string): void {
    this.handler?.openDrawer(message);
  }

  closeDrawer(): void {
    this.handler?.closeDrawer();
  }
}
