import type { Meta, StoryObj } from '@storybook/react';
import { Text } from '@backstage/ui';
import { NewTabLink } from './NewTabLink';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/NewTabLink',
  component: NewTabLink,
  tags: ['autodocs'],
  args: {
    href: '/customize/connectors?installation=example',
    children: 'Sign in to muster',
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A bui link that opens in a new tab (`target="_blank"` + ' +
            '`rel="noopener noreferrer"`), with a launch icon for the eye and ' +
            '"(opens in a new tab)" for a screen reader.',
          whenToUse:
            'For a link inside a form or wizard with input to keep, in the app ' +
            'or outside it: following it leaves the form where it is.',
          migration: 'mixed',
          extra: 'The launch icon is MUI v4 (bui ships no icon set).',
        }),
      },
    },
  },
} satisfies Meta<typeof NewTabLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const InSentence: Story = {
  args: { variant: 'body-small', children: 'add a model' },
  render: args => (
    <Text as="p" variant="body-small" color="secondary">
      Platform admins can <NewTabLink {...args} /> in the Models tab.
    </Text>
  ),
};
