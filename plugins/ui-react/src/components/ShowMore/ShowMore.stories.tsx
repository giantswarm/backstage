import type { Meta, StoryObj } from '@storybook/react';
import { ShowMore } from './ShowMore';
import { componentDocs } from '../../storybook/docs';

const TOOLS = Array.from({ length: 23 }, (_, i) => `tool-${i + 1}`);

const meta = {
  title: 'Components/ShowMore',
  component: ShowMore,
  tags: ['autodocs'],
  args: {
    items: TOOLS,
    initial: 5,
    noun: 'tool',
    children: visible => (
      <ul>
        {visible.map(item => (
          <li key={String(item)}>{String(item)}</li>
        ))}
      </ul>
    ),
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'Renders the first few items of a list and reveals the rest a page at a time.',
          whenToUse:
            'For a list that is usually short but can grow long, e.g. a server’s tools. With `revealAll`, one click shows the whole list — for a short excerpt of a bounded set.',
          migration: 'bui',
        }),
      },
    },
  },
} satisfies Meta<typeof ShowMore>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PageAtATime: Story = {};

export const RevealAll: Story = {
  args: { revealAll: true, noun: 'agent' },
};
