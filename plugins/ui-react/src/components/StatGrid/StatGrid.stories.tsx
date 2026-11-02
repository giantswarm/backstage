import type { Meta, StoryObj } from '@storybook/react';
import { Stat } from '../Stat';
import { StatGrid } from './StatGrid';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/StatGrid',
  component: StatGrid,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'The responsive row headline `Stat` tiles sit in: four across where there is room, two on a phone.',
          whenToUse:
            'Around a page’s row of `Stat variant="tile"` figures, e.g. the KPIs above a usage or cost page. Not for an inline strip of stats inside a card — lay those out with bui `Flex`.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof StatGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: [
      <Stat key="spend" variant="tile" label="Spend" value="$1,234.56" />,
      <Stat key="calls" variant="tile" label="Model calls" value="12,345" />,
      <Stat key="tokens" variant="tile" label="Tokens" value="7.5M" />,
      <Stat key="sessions" variant="tile" label="Sessions" value="318" />,
    ],
  },
};
