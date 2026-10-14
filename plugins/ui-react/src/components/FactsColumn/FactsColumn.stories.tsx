import type { Meta, StoryObj } from '@storybook/react';
import { Link } from '@backstage/ui';
import { FactsColumn } from './FactsColumn';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/FactsColumn',
  component: FactsColumn,
  tags: ['autodocs'],
  args: {
    facts: [
      { label: 'Sign-in', value: 'Company login' },
      { label: 'Health', value: '2 of 2 instances healthy' },
      { label: 'Address', value: 'https://mcp.example.com/mcp' },
    ],
  },
  decorators: [
    Story => (
      <div style={{ maxWidth: 300 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'The narrow column of facts beside a detail page’s content, each ' +
            'label a muted caption over its value.',
          whenToUse:
            'In `ShellPage`’s `aside` on an agent, model or connector page. ' +
            'For facts in the main column, use `FactList` side by side.',
          migration: 'mixed',
        }),
      },
    },
  },
} satisfies Meta<typeof FactsColumn>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithFooter: Story = {
  args: {
    children: <Link href="#settings">Edit settings</Link>,
  },
};
