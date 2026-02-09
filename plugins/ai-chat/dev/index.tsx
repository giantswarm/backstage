import { createDevApp } from '@backstage/dev-utils';
import { AiChatPage } from '../src/components/AiChat';

createDevApp()
  .addPage({
    element: <AiChatPage />,
    title: 'Root Page',
    path: '/ai-chat',
  })
  .render();
