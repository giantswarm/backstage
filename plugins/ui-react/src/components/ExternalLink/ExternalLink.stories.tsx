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
            'bui’s `Link`, opening in a new tab (`target="_blank"` + ' +
            '`rel="noopener noreferrer"`) with a trailing “launch” icon that ' +
            'inherits the surrounding font size, and “(opens in a new tab)” ' +
            'for screen readers.',
          whenToUse:
            'For any link leaving the app (external docs, dashboards, GitHub), ' +
            'and for any link inside a form or wizard with input to keep, so ' +
            'following it leaves the form where it is. The icon signals “opens ' +
            'elsewhere”; the `rel` attributes are the safe default so callers ' +
            'don’t have to remember them.',
          migration: 'mixed',
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

export const Variant: Story = {
  args: { variant: 'body-small', children: 'All portal settings' },
  parameters: {
    docs: {
      description: {
        story:
          'With a bui `variant` the link sets its own size; without one it ' +
          'takes the font of the text around it.',
      },
    },
  },
};

export const Inline: Story = {
  args: {
    display: 'inline',
    href: 'https://github.com/example-org/example-repository',
    children: 'example-org/a-long-repository-name-that-wraps',
  },
  render: args => (
    <p style={{ maxWidth: 280 }}>
      Change it in the file that defines it in <ExternalLink {...args} />.
    </p>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Inline `inline` display — for a link in running text: a long ' +
          'link text wraps with the sentence and the icon follows its last word.',
      },
    },
  },
};
