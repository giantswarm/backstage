import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ButtonIcon, TextAreaField } from '@backstage/ui';
import AddPhotoAlternateOutlinedIcon from '@material-ui/icons/AddPhotoAlternateOutlined';
import ArrowUpwardIcon from '@material-ui/icons/ArrowUpward';
import {
  ComposerAttachment,
  ComposerAttachmentList,
  ComposerAttachmentListProps,
} from './ComposerAttachmentList';
import { ComposerFrame } from '../ComposerFrame';
import { componentDocs } from '../../storybook/docs';

/** A small striped image, so a thumbnail has something to crop. */
const IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#dbeafe"/><rect y="30" width="160" height="30" fill="#60a5fa"/></svg>',
)}`;

const ATTACHMENTS: ComposerAttachment[] = [
  {
    id: 'a',
    name: 'Screenshot 2026-10-15 at 09.41.12.png',
    previewUrl: IMAGE,
    description: 'PNG · 412 KiB',
  },
  {
    id: 'b',
    name: 'grafana-panel.jpg',
    previewUrl: IMAGE,
    description: 'JPEG · 1.2 MiB',
  },
];

const meta = {
  title: 'Components/ComposerAttachmentList',
  component: ComposerAttachmentList,
  tags: ['autodocs'],
  args: {
    attachments: ATTACHMENTS,
    label: 'Attached images',
    onRemove: () => {},
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
            'What a message carries besides its text, before it is sent: a ' +
            'chip per attachment with a thumbnail, its name and a remove control.',
          whenToUse:
            "In `ComposerFrame`'s `attachments` slot, for images pasted, dropped " +
            'or picked into a chat-style composer. The caller owns the list and ' +
            'its limits; this only shows it and reports removals.',
          migration: 'bui',
          extra:
            'Removing one moves the focus to the next remove control, and removing ' +
            'the last calls `onEmptied` so the caller can put the focus back in the ' +
            'text field. On touch input the remove control is a 44px target.',
        }),
      },
    },
  },
} satisfies Meta<typeof ComposerAttachmentList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The list in a composer, removing for real. */
function InAComposerDemo(args: ComposerAttachmentListProps) {
  const [attachments, setAttachments] = useState(args.attachments);
  return (
    <ComposerFrame
      attachments={
        <ComposerAttachmentList
          {...args}
          attachments={attachments}
          onRemove={id =>
            setAttachments(current => current.filter(item => item.id !== id))
          }
        />
      }
      input={
        <TextAreaField
          aria-label="Message"
          placeholder="Send a message to this session…"
        />
      }
      trailing={
        <>
          <ButtonIcon
            type="button"
            variant="tertiary"
            aria-label="Attach images"
            icon={<AddPhotoAlternateOutlinedIcon />}
          />
          <ButtonIcon
            type="submit"
            aria-label="Send"
            icon={<ArrowUpwardIcon />}
          />
        </>
      }
    />
  );
}

export const InAComposer: Story = {
  render: args => <InAComposerDemo {...args} />,
  parameters: {
    docs: {
      description: {
        story:
          'In the box, above the text field. Remove an image to see the focus move on.',
      },
    },
  },
};
