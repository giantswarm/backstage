import type { Meta, StoryObj } from '@storybook/react';
import { CodeBlock } from './CodeBlock';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/CodeBlock',
  component: CodeBlock,
  tags: ['autodocs'],
  args: {
    text: 'kubectl gs login https://api.example.eu-central-1.aws.gigantic.io',
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'A monospaced, wrapping code block with a built-in copy-to-clipboard ' +
            'button (with “Copied” feedback). Copy failures are reported through ' +
            'the app `errorApi`, like Backstage’s own `CopyTextButton`.',
          whenToUse:
            'To present a shell command or short snippet a user is meant to copy. ' +
            'No syntax highlighting is applied — for highlighted JSON use ' +
            '`JsonHighlight`, and for an editable YAML surface use `YamlEditor`.',
          migration: 'mixed',
          extra:
            'The copy button is bui (`@backstage/ui` `ButtonIcon`/`Tooltip`); the ' +
            'block styling still uses MUI v4 `makeStyles`.',
        }),
      },
    },
  },
} satisfies Meta<typeof CodeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutCopyButton: Story = {
  args: { copyEnabled: false },
  parameters: {
    docs: {
      description: {
        story:
          'With `copyEnabled={false}` the copy affordance (and its padding) is removed.',
      },
    },
  },
};

export const Transparent: Story = {
  args: { transparent: true },
  parameters: {
    docs: {
      description: {
        story:
          'A transparent background lets the block sit inside an already-shaded ' +
          'container without a nested “box in a box” look.',
      },
    },
  },
};

export const Multiline: Story = {
  args: {
    text: [
      'helm repo add giantswarm https://giantswarm.github.io/giantswarm-catalog',
      'helm repo update',
      'helm install my-app giantswarm/my-app',
    ].join('\n'),
  },
};
