import type { Meta, StoryObj } from '@storybook/react';
import { ExternalLink } from './ExternalLink';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/ExternalLink',
  component: ExternalLink,
  tags: ['autodocs'],
  args: {
    href: 'https://docs.giantswarm.io',
    children: 'Giant Swarm docs',
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A link that opens in a new tab (`target="_blank"` + ' +
            '`rel="noopener noreferrer"`) with a trailing “launch” icon that ' +
            'inherits the surrounding font size.',
          whenToUse:
            'For any link leaving the app (external docs, dashboards, GitHub). ' +
            'The icon signals “opens elsewhere”; the `rel` attributes are the safe ' +
            'default so callers don’t have to remember them.',
          migration: 'mui-v4',
        }),
      },
    },
  },
} satisfies Meta<typeof ExternalLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const InlineFlex: Story = {
  args: { display: 'inline-flex' },
  parameters: {
    docs: {
      description: {
        story:
          'Default `inline-flex` display — the link sits inline with surrounding text.',
      },
    },
  },
};

export const Flex: Story = {
  args: { display: 'flex' },
  parameters: {
    docs: {
      description: {
        story:
          'Block-level `flex` display — use when the link must participate in a ' +
          'width-constraint chain (e.g. inside a flex/grid item that truncates text).',
      },
    },
  },
};
