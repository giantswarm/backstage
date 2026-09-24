import type { Meta, StoryObj } from '@storybook/react';
import { CopyButton } from './CopyButton';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/CopyButton',
  component: CopyButton,
  tags: ['autodocs'],
  args: {
    text: 'kubectl gs login https://api.example.eu-central-1.aws.gigantic.io',
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'An icon button that copies `text` to the clipboard and confirms ' +
            'with “Copied” for a moment. Copy failures are reported through the ' +
            'app `errorApi`, like Backstage’s own `CopyTextButton`.',
          whenToUse:
            'Next to a value a user is meant to lift verbatim — in a card ' +
            'header (`InfoCard` `headerActions`) or beside a block. `CodeBlock` ' +
            'uses it for its built-in copy affordance.',
          migration: 'mixed',
          extra:
            'bui `ButtonIcon` and `Tooltip`; the icons are `@material-ui/icons`, ' +
            'since bui ships no icon set.',
        }),
      },
    },
  },
} satisfies Meta<typeof CopyButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = {
  args: { label: 'Copy system prompt' },
  parameters: {
    docs: {
      description: {
        story:
          'Name what is copied when the button stands apart from its value.',
      },
    },
  },
};
