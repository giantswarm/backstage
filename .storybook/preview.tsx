import type { Preview } from '@storybook/react';
// bui (@backstage/ui) styles — same stylesheet the app loads in index.tsx.
// Required for bui-based components (InfoCard, CodeBlock) to render correctly.
import '@backstage/ui/css/styles.css';
import { withGSProviders } from './decorators';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      // Intro first, then components A→Z.
      storySort: {
        order: ['Introduction', 'Components', '*'],
      },
    },
  },
  decorators: [withGSProviders],
  // Toolbar control to switch every story between the real GS light and dark
  // themes (read by the global decorator).
  globalTypes: {
    theme: {
      name: 'Theme',
      description: 'Giant Swarm app theme',
      defaultValue: 'light',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: [
          { value: 'light', title: 'Light', icon: 'sun' },
          { value: 'dark', title: 'Dark', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
  },
};

export default preview;
