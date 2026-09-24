import type { Meta, StoryObj } from '@storybook/react';
import { ButtonIcon, Select, TextAreaField } from '@backstage/ui';
import ArrowForwardIcon from '@material-ui/icons/ArrowForward';
import ArrowUpwardIcon from '@material-ui/icons/ArrowUpward';
import StopIcon from '@material-ui/icons/Stop';
import { ComposerFrame } from './ComposerFrame';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/ComposerFrame',
  component: ComposerFrame,
  tags: ['autodocs'],
  args: {
    input: (
      <TextAreaField
        aria-label="Prompt"
        placeholder="What should the agent do?"
      />
    ),
    leading: (
      <Select
        aria-label="Agent"
        placeholder="Select an agent"
        options={[
          { id: 'sre', label: 'SRE Agent' },
          { id: 'docs', label: 'Docs Agent' },
        ]}
      />
    ),
    trailing: (
      <ButtonIcon
        type="submit"
        aria-label="Start"
        icon={<ArrowForwardIcon />}
      />
    ),
    minRows: 3,
    maxRows: 12,
  },
  decorators: [
    Story => (
      <div style={{ maxWidth: 560 }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'The box of a chat-style composer: a text field that grows with its ' +
            'content, with a row of controls inside the same border underneath it.',
          whenToUse:
            'For a prompt or message box whose submit — and any choice of where the ' +
            'message goes — belongs to the text, like a chat input. It is ' +
            'presentation only: the caller owns the value, the submit and the ' +
            'controls, and puts any caption under the box. For a plain multi-line ' +
            'form field, use bui `TextAreaField` on its own.',
          migration: 'bui',
          extra:
            'Pass a bui `TextAreaField` as `input`; the frame removes its own ' +
            'background, ring and resize handle, since the frame is the visible ' +
            'box. A bui `Select` in `leading` has no fill until hovered. The ' +
            'styling is MUI v4 `makeStyles` over bui tokens, because it overrides ' +
            'bui internals by their stable class names.',
        }),
      },
    },
  },
} satisfies Meta<typeof ComposerFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Reply: Story = {
  args: {
    input: (
      <TextAreaField
        aria-label="Message"
        placeholder="Send a message to this session…"
      />
    ),
    leading: undefined,
    trailing: (
      <ButtonIcon type="submit" aria-label="Send" icon={<ArrowUpwardIcon />} />
    ),
    minRows: 2,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Without `leading`, the trailing control keeps its place at the right.',
      },
    },
  },
};

export const Working: Story = {
  args: {
    ...Reply.args,
    trailing: (
      <ButtonIcon
        type="button"
        aria-label="Stop"
        variant="secondary"
        icon={<StopIcon />}
      />
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          'A different trailing control in the same slot, e.g. Stop while a ' +
          'reply is being written.',
      },
    },
  },
};

export const Disabled: Story = {
  args: {
    ...Reply.args,
    input: (
      <TextAreaField
        aria-label="Message"
        placeholder="Answer the question above to continue."
        isDisabled
      />
    ),
    trailing: (
      <ButtonIcon
        type="submit"
        aria-label="Send"
        icon={<ArrowUpwardIcon />}
        isDisabled
      />
    ),
    isDisabled: true,
  },
};
