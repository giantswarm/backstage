import type { Meta, StoryObj } from '@storybook/react';
import { ExternalButtonLink } from './ExternalButtonLink';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/ExternalButtonLink',
  component: ExternalButtonLink,
  tags: ['autodocs'],
  args: {
    href: 'https://github.com/example-org/example-repository/pull/1',
    children: 'Review pull request',
    variant: 'secondary',
    size: 'small',
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'bui’s `ButtonLink` that opens in a new tab (`target="_blank"` + ' +
            '`rel="noopener noreferrer"`), with the same trailing “launch” ' +
            'icon as `ExternalLink` and “(opens in a new tab)” for screen ' +
            'readers.',
          whenToUse:
            'For a button that leaves the app: review a pull request on ' +
            'GitHub, open a sign-in page, read the docs. A text link that ' +
            'leaves the app is `ExternalLink`; a table cell is ' +
            '`ExternalCellText`. All three mark the new tab alike.',
          migration: 'mixed',
        }),
      },
    },
  },
} satisfies Meta<typeof ExternalButtonLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Primary: Story = {
  args: { variant: 'primary', children: 'Sign in to example' },
};
